'use strict';

const fsp = require('fs/promises');
const path = require('path');
const {
  loadLanguageModelSettings,
} = require('../config');
const { MINDMAP_FILE } = require('../constants');
const {
  buildUrl,
  extractProviderErrorMessage,
} = require('./llm-test');

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

function stripCodeFence(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed.startsWith('```')) {
    return trimmed;
  }

  return trimmed
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
}

function tryParseJsonBlock(text) {
  const normalized = stripCodeFence(text);
  const candidates = [normalized];

  const objectStart = normalized.indexOf('{');
  const objectEnd = normalized.lastIndexOf('}');
  if (objectStart !== -1 && objectEnd !== -1 && objectEnd > objectStart) {
    candidates.push(normalized.slice(objectStart, objectEnd + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {}
  }

  throw new Error('模型返回的思维导图 JSON 无法解析');
}

function extractTextFromOpenAICompatiblePayload(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function extractTextFromClaudePayload(payload) {
  const content = payload?.content;
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .map((part) => (part?.type === 'text' && typeof part.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n');
}

function extractTextFromGeminiPayload(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    return '';
  }
  return parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n');
}

async function requestMindMapJson(url, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MINDMAP_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json()
      : { message: await response.text() };

    return { response, payload };
  } finally {
    clearTimeout(timeout);
  }
}

function getProviderConfig(settings, provider) {
  const config = settings.providers?.[provider];
  if (!config) {
    throw new Error('未找到指定的语言模型配置');
  }
  if (!config.enabled) {
    throw new Error('该语言模型 Provider 未启用');
  }
  if (!String(config.apiKey || '').trim()) {
    throw new Error('该语言模型 Provider 缺少 API Key');
  }
  return config;
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

async function generateWithOpenAICompatible(config, prompt) {
  const { response, payload } = await requestMindMapJson(
    buildUrl(config.baseUrl, '/chat/completions'),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'system',
            content: 'You output strict JSON only.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: Math.min(config.temperature, 0.6),
        max_tokens: config.maxTokens,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      extractProviderErrorMessage(payload, `模型请求失败 (HTTP ${response.status})`),
    );
  }

  return extractTextFromOpenAICompatiblePayload(payload);
}

async function generateWithClaude(config, prompt) {
  const { response, payload } = await requestMindMapJson(
    buildUrl(config.baseUrl, '/messages'),
    {
      method: 'POST',
      headers: {
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.maxTokens,
        temperature: Math.min(config.temperature, 0.6),
        system: 'You output strict JSON only.',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      extractProviderErrorMessage(payload, `Claude 请求失败 (HTTP ${response.status})`),
    );
  }

  return extractTextFromClaudePayload(payload);
}

async function generateWithGemini(config, prompt) {
  const modelPath = `/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
  const { response, payload } = await requestMindMapJson(
    buildUrl(config.baseUrl, modelPath),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: Math.min(config.temperature, 0.6),
          maxOutputTokens: config.maxTokens,
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      extractProviderErrorMessage(payload, `Gemini 请求失败 (HTTP ${response.status})`),
    );
  }

  return extractTextFromGeminiPayload(payload);
}

async function generateMindMapDocument(record, provider) {
  const settings = await loadLanguageModelSettings();
  const config = getProviderConfig(settings, provider);
  const prompt = buildMindMapPrompt(record);

  let rawText = '';

  if (provider === 'openai' || provider === 'qwen' || provider === 'zhipu') {
    rawText = await generateWithOpenAICompatible(config, prompt);
  } else if (provider === 'claude') {
    rawText = await generateWithClaude(config, prompt);
  } else if (provider === 'gemini') {
    rawText = await generateWithGemini(config, prompt);
  } else {
    throw new Error('不支持的语言模型 Provider');
  }

  if (!rawText.trim()) {
    throw new Error('模型未返回有效的思维导图内容');
  }

  const parsed = tryParseJsonBlock(rawText);
  const document = normalizeMindMapDocument(parsed, record?.title || '思维导图');
  return {
    document,
    generator: {
      provider,
      model: config.model,
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
