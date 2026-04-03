import type { TranscribeSegment } from '@/types';

const ANSI_REGEX = /\u001B\[[0-?]*[ -/]*[@-~]/g;
const SEGMENT_REGEX = /\[(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})\]\s*(.*)/;
const PROGRESS_REGEX = /progress\s*=\s*(\d+)%/i;

function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, '');
}

function normalizeLineBreaks(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function toWhisperTimestamp(timestamp: string): string {
  const normalized = timestamp.replace(',', '.');
  return normalized.includes('.') ? normalized : `${normalized}.000`;
}

export function buildTranscriptFromSegments(segments: TranscribeSegment[]): string {
  return segments
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join('\n');
}

export function parseSrtSegments(srtContent: string): TranscribeSegment[] {
  const blocks = normalizeLineBreaks(srtContent)
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  const segments: TranscribeSegment[] = [];

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) continue;

    const timestampLineIndex = lines.findIndex((line) => line.includes('-->'));
    if (timestampLineIndex === -1) continue;

    const timestampLine = lines[timestampLineIndex];
    const textLines = lines.slice(timestampLineIndex + 1);
    if (textLines.length === 0) continue;

    const [startRaw, endRaw] = timestampLine.split('-->').map((part) => part.trim());
    if (!startRaw || !endRaw) continue;

    segments.push({
      timestamp: `[${toWhisperTimestamp(startRaw)} --> ${toWhisperTimestamp(endRaw)}]`,
      text: textLines.join(' ').trim(),
    });
  }

  return segments;
}

export interface WhisperOutputParserOptions {
  onProgress: (percent: number) => void;
  onSegment: (segment: TranscribeSegment) => void;
}

export function createWhisperOutputParser(options: WhisperOutputParserOptions) {
  let buffer = '';
  let lastSegmentKey = '';
  let lastProgress = -1;

  function handleLine(rawLine: string) {
    const line = stripAnsi(rawLine).trim();
    if (!line) return;

    const segmentMatch = line.match(SEGMENT_REGEX);
    if (segmentMatch) {
      const segment: TranscribeSegment = {
        timestamp: `[${segmentMatch[1]} --> ${segmentMatch[2]}]`,
        text: segmentMatch[3].trim(),
      };

      if (!segment.text) return;

      const segmentKey = `${segment.timestamp}|${segment.text}`;
      if (segmentKey === lastSegmentKey) return;

      lastSegmentKey = segmentKey;
      options.onSegment(segment);
      return;
    }

    const progressMatch = line.match(PROGRESS_REGEX);
    if (progressMatch) {
      const progress = parseInt(progressMatch[1], 10);
      if (Number.isNaN(progress) || progress === lastProgress) return;

      lastProgress = progress;
      options.onProgress(progress);
    }
  }

  function push(text: string) {
    buffer += normalizeLineBreaks(text);
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      handleLine(line);
    }
  }

  function flush() {
    const trailing = buffer.trim();
    buffer = '';
    if (trailing) {
      handleLine(trailing);
    }
  }

  return { push, flush };
}
