'use strict';

const { loadLanguageModelSettings } = require('../config');
const {
  buildUrl,
  extractProviderErrorMessage,
  parseJsonSafe,
  requestOpenAICompatibleChatWithFallback,
} = require('./llm-test');

const DEFAULT_GENERATION_TIMEOUT_MS = 120000;

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

  throw new Error('模型返回的 JSON 无法解析');
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

async function requestProviderJson(url, init, timeoutMs = DEFAULT_GENERATION_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    const payload = await parseJsonSafe(response);
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

async function generateWithOpenAICompatible(config, prompt, options) {
  const { response, payload } = await requestProviderJson(
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
            content: options.systemPrompt,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: Math.min(config.temperature, options.temperatureCap),
        max_tokens: config.maxTokens,
      }),
    },
    options.timeoutMs,
  );

  if (!response.ok) {
    throw new Error(
      extractProviderErrorMessage(payload, `模型请求失败 (HTTP ${response.status})`),
    );
  }

  return extractTextFromOpenAICompatiblePayload(payload);
}

async function generateWithClaude(config, prompt, options) {
  const { response, payload } = await requestProviderJson(
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
        temperature: Math.min(config.temperature, options.temperatureCap),
        system: options.systemPrompt,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    },
    options.timeoutMs,
  );

  if (!response.ok) {
    throw new Error(
      extractProviderErrorMessage(payload, `Claude 请求失败 (HTTP ${response.status})`),
    );
  }

  return extractTextFromClaudePayload(payload);
}

async function generateWithAnthropicThirdParty(config, prompt, options) {
  const request =
    config.apiFormat === 'anthropic'
      ? requestProviderJson(
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
              temperature: Math.min(config.temperature, options.temperatureCap),
              system: options.systemPrompt,
              messages: [
                {
                  role: 'user',
                  content: prompt,
                },
              ],
            }),
          },
          options.timeoutMs,
        )
      : requestOpenAICompatibleChatWithFallback(
          config,
          {
            model: config.model,
            messages: [
              {
                role: 'system',
                content: options.systemPrompt,
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            temperature: Math.min(config.temperature, options.temperatureCap),
            max_tokens: config.maxTokens,
          },
          options.timeoutMs,
        );
  const { response, payload } = await request;

  if (!response.ok) {
    throw new Error(
      extractProviderErrorMessage(
        payload,
        `Third-party API 请求失败 (HTTP ${response.status})`,
      ),
    );
  }

  return config.apiFormat === 'anthropic'
    ? extractTextFromClaudePayload(payload)
    : extractTextFromOpenAICompatiblePayload(payload);
}

async function generateWithGemini(config, prompt, options) {
  const modelPath = `/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
  const { response, payload } = await requestProviderJson(
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
          temperature: Math.min(config.temperature, options.temperatureCap),
          maxOutputTokens: config.maxTokens,
        },
      }),
    },
    options.timeoutMs,
  );

  if (!response.ok) {
    throw new Error(
      extractProviderErrorMessage(payload, `Gemini 请求失败 (HTTP ${response.status})`),
    );
  }

  return extractTextFromGeminiPayload(payload);
}

async function requestLanguageModelText(provider, prompt, options = {}) {
  const resolvedOptions = {
    systemPrompt: options.systemPrompt || 'You output strict JSON only.',
    temperatureCap: typeof options.temperatureCap === 'number' ? options.temperatureCap : 0.6,
    timeoutMs: typeof options.timeoutMs === 'number' ? options.timeoutMs : DEFAULT_GENERATION_TIMEOUT_MS,
  };
  const settings = await loadLanguageModelSettings();
  const config = getProviderConfig(settings, provider);

  let text = '';
  if (provider === 'openai' || provider === 'qwen' || provider === 'zhipu') {
    text = await generateWithOpenAICompatible(config, prompt, resolvedOptions);
  } else if (provider === 'claude') {
    text = await generateWithClaude(config, prompt, resolvedOptions);
  } else if (provider === 'anthropic-third-party') {
    text = await generateWithAnthropicThirdParty(config, prompt, resolvedOptions);
  } else if (provider === 'gemini') {
    text = await generateWithGemini(config, prompt, resolvedOptions);
  } else {
    throw new Error('不支持的语言模型 Provider');
  }

  if (!String(text || '').trim()) {
    throw new Error('模型未返回有效内容');
  }

  return {
    text,
    model: config.model,
  };
}

module.exports = {
  DEFAULT_GENERATION_TIMEOUT_MS,
  stripCodeFence,
  tryParseJsonBlock,
  requestLanguageModelText,
};
