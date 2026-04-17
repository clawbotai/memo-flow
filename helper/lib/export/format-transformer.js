'use strict';

const { loadContentPoints } = require('../transcription/content-points');
const { readMindMapDocument } = require('../transcription/mindmap');

function sanitizeFileName(input) {
  return (
    String(input || '')
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200) || '未命名转录'
  );
}

function formatDateTime(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString('zh-CN', { hour12: false });
}

function formatDuration(seconds) {
  if (!Number.isFinite(Number(seconds))) return '';
  const total = Math.max(0, Math.floor(Number(seconds)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remain = total % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(remain).padStart(2, '0')}s`;
  }
  return `${minutes}m ${String(remain).padStart(2, '0')}s`;
}

function formatTranscript(record) {
  if (Array.isArray(record?.segments) && record.segments.length > 0) {
    return record.segments
      .map((segment) => {
        const timestamp = String(segment?.timestamp || '')
          .match(/\[(\d{2}:\d{2}:\d{2}\.\d{3})/);
        const label = timestamp ? timestamp[1] : '';
        const text = String(segment?.text || '').trim();
        return label ? `[${label}] ${text}` : text;
      })
      .filter(Boolean)
      .join('\n');
  }

  return String(record?.transcript || '').trim();
}

function renderPointsSection(pointsResult) {
  if (!pointsResult || !Array.isArray(pointsResult.points) || pointsResult.points.length === 0) {
    return '';
  }

  const sections = [];

  if (pointsResult.theme) {
    sections.push('## 概述');
    sections.push(String(pointsResult.theme).trim());
    sections.push('');
  }

  const groups = [
    { type: 'viral', title: '传播观点' },
    { type: 'controversial', title: '争议观点' },
    { type: 'quote', title: '金句' },
  ];

  sections.push('## 关键观点');
  sections.push('');

  for (const group of groups) {
    const groupItems = pointsResult.points.filter((item) => item?.type === group.type);
    if (!groupItems.length) {
      continue;
    }

    sections.push(`### ${group.title}`);
    sections.push('');

    for (const item of groupItems) {
      if (group.type === 'quote') {
        const suffix = item.sourceTimestamp ? ` — ${item.sourceTimestamp}` : '';
        sections.push(`> ${String(item.text || '').trim()}${suffix}`);
      } else {
        sections.push(`- ${String(item.text || '').trim()}`);
      }
    }

    sections.push('');
  }

  return sections.join('\n').trim();
}

function toMermaidLabel(input) {
  return String(input || '')
    .replace(/"/g, '\\"')
    .replace(/\n+/g, ' ')
    .trim();
}

function appendMermaidNode(lines, node, depth) {
  const text = toMermaidLabel(node?.data?.text || '未命名节点');
  const indent = '  '.repeat(depth);
  lines.push(`${indent}"${text}"`);

  const children = Array.isArray(node?.children) ? node.children : [];
  for (const child of children) {
    appendMermaidNode(lines, child, depth + 1);
  }
}

function renderMindmapSection(document) {
  if (!document?.root) {
    return '';
  }

  const lines = ['## 思维导图', '', '```mermaid', 'mindmap'];
  appendMermaidNode(lines, document.root, 1);
  lines.push('```');
  return lines.join('\n');
}

async function buildExportPayload(record) {
  const title = String(record?.title || '未命名转录').trim() || '未命名转录';
  const transcript = formatTranscript(record);
  if (!transcript) {
    throw new Error('当前转录内容为空，无法导出');
  }

  let pointsSection = '';
  let mindmapSection = '';

  if (record?.savedPath) {
    try {
      const pointsResult = await loadContentPoints(record.savedPath);
      pointsSection = renderPointsSection(pointsResult);
    } catch {}

    try {
      const document = await readMindMapDocument(record.savedPath);
      mindmapSection = renderMindmapSection(document);
    } catch {}
  }

  const baseLines = [
    `# ${title}`,
    '',
    '## 基本信息',
    '',
    `- 导出时间：${formatDateTime(new Date())}`,
    record?.author ? `- 作者：${record.author}` : '',
    record?.sourceUrl ? `- 原始链接：${record.sourceUrl}` : '',
    record?.pubDate ? `- 发布日期：${formatDateTime(record.pubDate)}` : '',
    record?.duration != null ? `- 时长：${formatDuration(record.duration)}` : '',
    record?.wordCount != null ? `- 字数：${record.wordCount}` : '',
  ].filter(Boolean);

  if (pointsSection) {
    baseLines.push('', pointsSection);
  }

  baseLines.push(
    '',
    '## 逐字稿',
    '',
    transcript,
  );

  if (mindmapSection) {
    baseLines.push('', mindmapSection);
  }

  const lines = baseLines.filter((line, index, array) => {
    if (line !== '') {
      return true;
    }
    return index === 0 || array[index - 1] !== '';
  });

  return {
    title,
    markdown: `${lines.join('\n').trim()}\n`,
    fileName: `${sanitizeFileName(title)}.md`,
  };
}

module.exports = {
  sanitizeFileName,
  buildExportPayload,
};
