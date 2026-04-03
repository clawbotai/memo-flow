import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import type { XiaoyuzhouEpisode } from '@/lib/xiaoyuzhou';
import type { TranscribeSegment } from '@/types';

function sanitizeDirName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200) || '未知标题';
}

function timestampToMMSS(ts: string): string {
  const match = ts.match(/(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return '00:00';
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  const totalMinutes = hours * 60 + minutes;
  return `${String(totalMinutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}小时${m}分${s}秒`;
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
}

export async function writeTranscriptTextFiles(
  episodeDir: string,
  segments: TranscribeSegment[],
  transcript: string,
): Promise<string> {
  await mkdir(episodeDir, { recursive: true });

  const timestampedLines = segments.map((segment) => {
    const startTs = segment.timestamp.match(/\[(\d{2}:\d{2}:\d{2}\.\d{3})/);
    const mmss = startTs ? timestampToMMSS(startTs[1]) : '00:00';
    return `${mmss}\t${segment.text}`;
  });

  await writeFile(path.join(episodeDir, '逐字稿.txt'), timestampedLines.join('\n'), 'utf8');
  await writeFile(path.join(episodeDir, '纯文本.txt'), transcript, 'utf8');

  return episodeDir;
}

export async function saveEpisodeTranscriptionFiles(
  outputDir: string,
  episodeInfo: XiaoyuzhouEpisode,
  segments: TranscribeSegment[],
  transcript: string,
  sourceUrl: string,
): Promise<string> {
  const episodeDir = path.join(outputDir, sanitizeDirName(episodeInfo.title));
  await mkdir(episodeDir, { recursive: true });

  const durationStr = episodeInfo.duration ? formatDuration(episodeInfo.duration) : '未知';
  const introContent = [
    `# ${episodeInfo.title}`,
    '',
    `- **作者**: ${episodeInfo.author}`,
    `- **时长**: ${durationStr}`,
    `- **发布日期**: ${episodeInfo.pubDate || '未知'}`,
    episodeInfo.thumbnail ? `- **缩略图**: ${episodeInfo.thumbnail}` : '',
    `- **原始链接**: ${sourceUrl}`,
    '',
    '## 描述',
    '',
    episodeInfo.description || '无描述',
    '',
  ].filter(Boolean).join('\n');

  await writeFile(path.join(episodeDir, '简介.md'), introContent, 'utf8');
  await writeTranscriptTextFiles(episodeDir, segments, transcript);

  return episodeDir;
}

export function resolveTranscriptOutputDir(
  outputDir: string,
  title: string,
  savedPath?: string,
): string {
  if (savedPath) {
    return savedPath;
  }

  return path.join(outputDir, sanitizeDirName(title));
}
