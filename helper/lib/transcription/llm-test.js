'use strict';

const { LANGUAGE_MODEL_PROVIDERS, LLM_TEST_TIMEOUT_MS } = require('../constants');
const {
  loadLanguageModelSettings,
  normalizeLanguageModelProviderConfig,
  mergeLanguageModelProviderConfig,
} = require('../config');

function buildUrl(baseUrl, pathname) {
  return `${String(baseUrl || '').replace(/\/$/, '')}${pathname}`;
}

function buildOpenAICompatibleChatUrls(baseUrl) {
  const normalizedBaseUrl = String(baseUrl || '').replace(/\/$/, '');
  const urls = [buildUrl(normalizedBaseUrl, '/chat/completions')];

  if (!/\/v\d+(?:beta\d+)?$/i.test(normalizedBaseUrl)) {
    urls.push(buildUrl(normalizedBaseUrl, '/v1/chat/completions'));
  }

  return [...new Set(urls)];
}

async function parseJsonSafe(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await response.text();
    return text ? { message: text } : null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractProviderErrorMessage(payload, fallback) {
  if (!payload) {
    return fallback;
  }

  if (typeof payload === 'string') {
    return payload;
  }

  const directMessage = payload?.error?.message || payload?.message || payload?.msg;
  if (directMessage) {
    return String(directMessage);
  }

  const directCode = payload?.error?.code || payload?.code;
  if (directCode) {
    return `${fallback} [${directCode}]`;
  }

  return fallback;
}

async function requestJson(url, init, timeoutMs = LLM_TEST_TIMEOUT_MS) {
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

async function requestOpenAICompatibleChatWithFallback(config, body, timeoutMs = LLM_TEST_TIMEOUT_MS) {
  let lastResult = null;

  for (const url of buildOpenAICompatibleChatUrls(config.baseUrl)) {
    const result = await requestJson(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
      timeoutMs,
    );

    if (result.response.status !== 404) {
      return result;
    }

    lastResult = result;
  }

  return lastResult;
}

async function testOpenAICompatibleChat(provider, config) {
  const { response, payload } = await requestJson(buildUrl(config.baseUrl, '/chat/completions'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: 'user',
          content: 'Reply with OK.',
        },
      ],
      temperature: config.temperature,
      max_tokens: config.maxTokens,
    }),
  });

  if (!response.ok) {
    return {
      success: false,
      message: extractProviderErrorMessage(
        payload,
        `${provider} 连接失败 (HTTP ${response.status})`,
      ),
      provider,
    };
  }

  return {
    success: true,
    message: '连接测试通过',
    provider,
  };
}

async function testClaudeConnection(config) {
  const { response, payload } = await requestJson(buildUrl(config.baseUrl, '/messages'), {
    method: 'POST',
    headers: {
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      messages: [
        {
          role: 'user',
          content: 'Reply with OK.',
        },
      ],
    }),
  });

  if (!response.ok) {
    return {
      success: false,
      message: extractProviderErrorMessage(payload, `Claude 连接失败 (HTTP ${response.status})`),
      provider: 'claude',
    };
  }

  return {
    success: true,
    message: '连接测试通过',
    provider: 'claude',
  };
}

async function testAnthropicThirdPartyConnection(config) {
  const request =
    config.apiFormat === 'anthropic'
      ? requestJson(buildUrl(config.baseUrl, '/messages'), {
          method: 'POST',
          headers: {
            'x-api-key': config.apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: config.model,
            max_tokens: config.maxTokens,
            temperature: config.temperature,
            messages: [
              {
                role: 'user',
                content: 'Reply with OK.',
              },
            ],
          }),
        })
      : requestOpenAICompatibleChatWithFallback(config, {
          model: config.model,
          messages: [
            {
              role: 'user',
              content: 'Reply with OK.',
            },
          ],
          temperature: config.temperature,
          max_tokens: config.maxTokens,
        });
  const { response, payload } = await request;

  if (!response.ok) {
    return {
      success: false,
      message: extractProviderErrorMessage(
        payload,
        `Third-party API 连接失败 (HTTP ${response.status})`,
      ),
      provider: 'anthropic-third-party',
    };
  }

  return {
    success: true,
    message: '连接测试通过',
    provider: 'anthropic-third-party',
  };
}

async function testGeminiConnection(config) {
  const modelPath = `/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
  const { response, payload } = await requestJson(buildUrl(config.baseUrl, modelPath), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Reply with OK.' }],
        },
      ],
      generationConfig: {
        temperature: config.temperature,
        maxOutputTokens: config.maxTokens,
      },
    }),
  });

  if (!response.ok) {
    return {
      success: false,
      message: extractProviderErrorMessage(payload, `Gemini 连接失败 (HTTP ${response.status})`),
      provider: 'gemini',
    };
  }

  return {
    success: true,
    message: '连接测试通过',
    provider: 'gemini',
  };
}

function validateLanguageModelTestInput(provider, config) {
  if (!LANGUAGE_MODEL_PROVIDERS.includes(provider)) {
    throw new Error('不支持的语言模型 Provider');
  }
  if (!String(config?.apiKey || '').trim() && config?.apiKeyConfigured !== true) {
    throw new Error('API Key 不能为空');
  }
  if (!String(config?.model || '').trim()) {
    throw new Error('Model 不能为空');
  }
  if (!String(config?.baseUrl || '').trim()) {
    throw new Error('Base URL 不能为空');
  }
}

async function testLanguageModelConnection(provider, config) {
  validateLanguageModelTestInput(provider, config);

  const currentSettings = await loadLanguageModelSettings();
  const mergedConfig = mergeLanguageModelProviderConfig(
    currentSettings.providers[provider],
    config,
    {
      apiKey: '',
      model: '',
      baseUrl: '',
      temperature: 0.7,
      maxTokens: 4096,
      enabled: false,
    },
  );

  const normalized = normalizeLanguageModelProviderConfig(mergedConfig, {
    apiKey: '',
    model: '',
    baseUrl: '',
    temperature: 0.7,
    maxTokens: 4096,
    enabled: false,
  });

  try {
    if (provider === 'openai' || provider === 'qwen' || provider === 'zhipu') {
      return await testOpenAICompatibleChat(provider, normalized);
    }

    if (provider === 'claude') {
      return await testClaudeConnection(normalized);
    }

    if (provider === 'anthropic-third-party') {
      return await testAnthropicThirdPartyConnection(normalized);
    }

    if (provider === 'gemini') {
      return await testGeminiConnection(normalized);
    }

    throw new Error('不支持的语言模型 Provider');
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { success: false, message: '连接超时', provider };
    }

    return {
      success: false,
      message: error instanceof Error ? error.message : '连接测试失败',
      provider,
    };
  }
}

module.exports = {
  buildUrl,
  buildOpenAICompatibleChatUrls,
  parseJsonSafe,
  extractProviderErrorMessage,
  requestJson,
  requestOpenAICompatibleChatWithFallback,
  testOpenAICompatibleChat,
  testClaudeConnection,
  testAnthropicThirdPartyConnection,
  testGeminiConnection,
  validateLanguageModelTestInput,
  testLanguageModelConnection,
};
