'use strict';

const fsp = require('fs/promises');
const path = require('path');
const {
  SEGMENT_REGEX,
  PROGRESS_REGEX,
  TRANSCRIPTION_PROGRESS_START,
  TRANSCRIPTION_PROGRESS_END,
} = require('../constants');
const { normalizeLineBreaks, stripAnsi } = require('../text-utils');

function buildTranscriptFromSegments(segments) {
  return segments
    .map((segment) => String(segment.text || '').trim())
    .filter(Boolean)
    .join('\n');
}

function toWhisperTimestamp(timestamp) {
  const normalized = timestamp.replace(',', '.');
  return normalized.includes('.') ? normalized : `${normalized}.000`;
}

function parseTimestampToSeconds(timestamp) {
  const match = String(timestamp || '').match(/(\d{2}):(\d{2}):(\d{2})(?:[.,](\d{1,3}))?/);
  if (!match) return null;

  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  const seconds = Number.parseInt(match[3], 10);
  const millis = Number.parseInt((match[4] || '0').padEnd(3, '0'), 10);

  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

function getSegmentEndSeconds(segmentTimestamp) {
  const parts = String(segmentTimestamp || '')
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .split('-->')
    .map((part) => part.trim());

  if (parts.length !== 2) return null;
  return parseTimestampToSeconds(parts[1]);
}

function clampProgress(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function mapTranscriptionRatioToProgress(ratio) {
  const safeRatio = Math.max(0, Math.min(1, ratio));
  return clampProgress(
    TRANSCRIPTION_PROGRESS_START +
      (TRANSCRIPTION_PROGRESS_END - TRANSCRIPTION_PROGRESS_START) * safeRatio,
  );
}

function getProgressFromSegment(segmentTimestamp, durationSeconds) {
  if (!durationSeconds || durationSeconds <= 0) return null;
  const endSeconds = getSegmentEndSeconds(segmentTimestamp);
  if (endSeconds == null) return null;
  return mapTranscriptionRatioToProgress(endSeconds / durationSeconds);
}

function getProgressFromWhisperPercent(percent) {
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  return mapTranscriptionRatioToProgress(safePercent / 100);
}

function getEstimatedTranscriptionProgress(elapsedMs, durationSeconds) {
  if (!durationSeconds || durationSeconds <= 0) return null;
  const expectedMs = Math.max(durationSeconds * 1500, 60000);
  const ratio = Math.min(elapsedMs / expectedMs, 1);
  const estimated = TRANSCRIPTION_PROGRESS_START + ratio * 45;
  return clampProgress(Math.min(estimated, 70));
}

function parseSrtSegments(srtContent) {
  const blocks = normalizeLineBreaks(srtContent)
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  const segments = [];

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
    if (!textLines.length) continue;

    const [startRaw, endRaw] = timestampLine.split('-->').map((part) => part.trim());
    if (!startRaw || !endRaw) continue;

    segments.push({
      timestamp: `[${toWhisperTimestamp(startRaw)} --> ${toWhisperTimestamp(endRaw)}]`,
      text: textLines.join(' ').trim(),
    });
  }

  return segments;
}

function createWhisperOutputParser({ onProgress, onSegment }) {
  let buffer = '';
  let lastSegmentKey = '';
  let lastProgress = -1;

  function handleLine(rawLine) {
    const line = stripAnsi(rawLine).trim();
    if (!line) return;

    const segmentMatch = line.match(SEGMENT_REGEX);
    if (segmentMatch) {
      const segment = {
        timestamp: `[${segmentMatch[1]} --> ${segmentMatch[2]}]`,
        text: segmentMatch[3].trim(),
      };
      const key = `${segment.timestamp}|${segment.text}`;
      if (!segment.text || key === lastSegmentKey) return;
      lastSegmentKey = key;
      onSegment(segment);
      return;
    }

    const progressMatch = line.match(PROGRESS_REGEX);
    if (!progressMatch) return;
    const progress = Number.parseInt(progressMatch[1], 10);
    if (Number.isNaN(progress) || progress === lastProgress) return;
    lastProgress = progress;
    onProgress(progress);
  }

  return {
    push(text) {
      buffer += normalizeLineBreaks(text);
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        handleLine(line);
      }
    },
    flush() {
      const trailing = buffer.trim();
      buffer = '';
      if (trailing) {
        handleLine(trailing);
      }
    },
  };
}

function sanitizeDirName(name) {
  return (
    String(name || '')
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200) || '未知标题'
  );
}

function timestampToMMSS(ts) {
  const match = ts.match(/(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return '00:00';
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  const seconds = Number.parseInt(match[3], 10);
  return `${String(hours * 60 + minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

async function writeTranscriptTextFiles(episodeDir, segments, transcript, meta = {}) {
  await fsp.mkdir(episodeDir, { recursive: true });

  const timestampedLines = segments.map((segment) => {
    const startTs = segment.timestamp.match(/\[(\d{2}:\d{2}:\d{2}\.\d{3})/);
    const mmss = startTs ? timestampToMMSS(startTs[1]) : '00:00';
    return `${mmss}\t${segment.text}`;
  });

  await fsp.writeFile(path.join(episodeDir, '逐字稿.txt'), timestampedLines.join('\n'), 'utf8');
  await fsp.writeFile(path.join(episodeDir, '纯文本.txt'), transcript, 'utf8');

  if (meta.sourceUrl || meta.title) {
    const intro = [
      meta.title ? `# ${meta.title}` : '',
      meta.author ? `作者: ${meta.author}` : '',
      meta.sourceUrl ? `原始链接: ${meta.sourceUrl}` : '',
      meta.pubDate ? `发布日期: ${meta.pubDate}` : '',
      meta.description ? '' : '',
      meta.description || '',
    ]
      .filter(Boolean)
      .join('\n');
    await fsp.writeFile(path.join(episodeDir, '简介.md'), intro, 'utf8');
  }

  return episodeDir;
}

module.exports = {
  buildTranscriptFromSegments,
  toWhisperTimestamp,
  parseTimestampToSeconds,
  getSegmentEndSeconds,
  clampProgress,
  mapTranscriptionRatioToProgress,
  getProgressFromSegment,
  getProgressFromWhisperPercent,
  getEstimatedTranscriptionProgress,
  parseSrtSegments,
  createWhisperOutputParser,
  sanitizeDirName,
  timestampToMMSS,
  writeTranscriptTextFiles,
};
