'use strict';

const fsp = require('fs/promises');
const path = require('path');
const { MINDMAP_FILE } = require('../constants');
const {
  requestLanguageModelText,
  tryParseJsonBlock,
} = require('./llm-provider');

const MINDMAP_TIMEOUT_MS = 120000;
const MAX_PROMPT_TRANSCRIPT_CHARS = 18000;

function getMindMapPath(savedPath) {
  if (!savedPath) {
    throw new Error('当前转录记录缺少保存目录，无法处理思维导图');
  }
  return path.join(path.resolve(String(savedPath)), MINDMAP_FILE);
}

function createDefaultView() {
  return {
    transform: {
      scaleX: 1,
      scaleY: 1,
      shear: 0,
      rotate: 0,
      translateX: 0,
      translateY: 0,
      originX: 0,
      originY: 0,
      a: 1,
      b: 0,
      c: 0,
      d: 1,
      e: 0,
      f: 0,
    },
    state: {
      scale: 1,
      x: 0,
      y: 0,
      sx: 0,
      sy: 0,
    },
  };
}

function normalizeNode(input, fallbackText = '未命名节点') {
  const text = String(
    input?.data?.text ??
      input?.text ??
      fallbackText,
  ).trim() || fallbackText;

  const childrenSource = Array.isArray(input?.children) ? input.children : [];

  return {
    data: {
      ...(input?.data && typeof input.data === 'object' ? input.data : {}),
      text,
      expand: input?.data?.expand !== false,
    },
    children: childrenSource.map((child, index) => normalizeNode(child, `节点 ${index + 1}`)),
  };
}

function normalizeMindMapDocument(input, fallbackTitle = '思维导图') {
  const rootSource = input?.root || input;

  return {
    layout: typeof input?.layout === 'string' && input.layout.trim() ? input.layout : 'logicalStructure',
    root: normalizeNode(rootSource, fallbackTitle),
    theme: {
      template: input?.theme?.template || 'default',
      config: input?.theme?.config && typeof input.theme.config === 'object' ? input.theme.config : {},
    },
    view: input?.view && typeof input.view === 'object' ? input.view : createDefaultView(),
    config: input?.config && typeof input.config === 'object' ? input.config : {},
  };
}

function buildMindMapPrompt(record) {
  const transcript = String(record?.transcript || '').trim();
  if (!transcript) {
    throw new Error('当前转录内容为空，无法生成思维导图');
  }

  const clippedTranscript = transcript.slice(0, MAX_PROMPT_TRANSCRIPT_CHARS);
  const clippedHint = transcript.length > clippedTranscript.length
    ? '\n注意：以下转录内容已截断，请优先抽取高密度信息。'
    : '';

  return [
    '你是一个中文思维导图整理助手。',
    '请基于给定转录内容提炼思维导图，只返回严格 JSON，不要输出 markdown、解释、代码围栏。',
    '返回结构必须是：{"text":"根节点","children":[{"text":"一级主题","children":[{"text":"关键点"}]}]}。',
    '要求：',
    '1. 根节点使用播客标题或主题总标题。',
    '2. 一级主题控制在 3 到 6 个。',
    '3. 每个一级主题下生成 2 到 5 个关键点。',
    '4. 所有节点都使用简体中文，文案简洁，避免句号结尾。',
    '5. 不要生成空 children 字段，除非确实没有下级节点。',
    clippedHint,
    '',
    `标题：${record?.title || '未命名转录'}`,
    '',
    '转录内容：',
    clippedTranscript,
  ].join('\n');
}

async function generateMindMapDocument(record, providerId, modelId) {
  const prompt = buildMindMapPrompt(record);
  const { text: rawText, model, modelId: resolvedModelId, providerName } = await requestLanguageModelText(providerId, modelId, prompt, {
    timeoutMs: MINDMAP_TIMEOUT_MS,
    temperatureCap: 0.6,
  });

  if (!rawText.trim()) {
    throw new Error('模型未返回有效的思维导图内容');
  }

  const parsed = tryParseJsonBlock(rawText);
  const document = normalizeMindMapDocument(parsed, record?.title || '思维导图');
  return {
    document,
    generator: {
      providerId,
      providerName,
      modelId: resolvedModelId,
      model,
    },
  };
}

async function readMindMapDocument(savedPath) {
  const mindmapPath = getMindMapPath(savedPath);
  const raw = await fsp.readFile(mindmapPath, 'utf8');
  return normalizeMindMapDocument(JSON.parse(raw), path.basename(path.resolve(savedPath)));
}

async function writeMindMapDocument(savedPath, document) {
  const directoryPath = path.resolve(String(savedPath));
  await fsp.mkdir(directoryPath, { recursive: true });
  const normalized = normalizeMindMapDocument(document, path.basename(directoryPath));
  const mindmapPath = getMindMapPath(directoryPath);
  await fsp.writeFile(mindmapPath, JSON.stringify(normalized, null, 2), 'utf8');
  return {
    path: mindmapPath,
    document: normalized,
  };
}

module.exports = {
  MINDMAP_TIMEOUT_MS,
  MAX_PROMPT_TRANSCRIPT_CHARS,
  getMindMapPath,
  normalizeMindMapDocument,
  generateMindMapDocument,
  readMindMapDocument,
  writeMindMapDocument,
};
