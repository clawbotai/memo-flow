'use strict';

const { LLM_TEST_TIMEOUT_MS } = require('../constants');
const { getLanguageModelProviderCard, loadLanguageModelSettings } = require('../config');

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
      providerId: config.providerId,
      providerName: config.providerName,
    };
  }

  return {
    success: true,
    message: '连接测试通过',
    providerId: config.providerId,
    providerName: config.providerName,
    modelId: config.id,
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
      providerId: config.providerId,
      providerName: config.providerName,
    };
  }

  return {
    success: true,
    message: '连接测试通过',
    providerId: config.providerId,
    providerName: config.providerName,
    modelId: config.id,
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
      providerId: config.providerId,
      providerName: config.providerName,
    };
  }

  return {
    success: true,
    message: '连接测试通过',
    providerId: config.providerId,
    providerName: config.providerName,
    modelId: config.id,
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
      providerId: config.providerId,
      providerName: config.providerName,
    };
  }

  return {
    success: true,
    message: '连接测试通过',
    providerId: config.providerId,
    providerName: config.providerName,
    modelId: config.id,
  };
}

function validateLanguageModelTestInput(providerId, config) {
  if (!String(providerId || '').trim()) {
    throw new Error('未指定语言模型 Provider');
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

/**
 * 构建运行时完整配置（Provider 连接信息 + 模型参数）
 */
function resolveProviderConfig(providerSettings, modelConfig) {
  return {
    ...modelConfig,
    providerId: providerSettings.id,
    providerName: providerSettings.name,
    kind: providerSettings.kind,
    presetType: providerSettings.presetType,
    apiKey: providerSettings.apiKey,
    baseUrl: providerSettings.baseUrl,
    apiFormat: providerSettings.apiFormat,
  };
}

async function testLanguageModelConnection(provider, modelId, clientConfig) {
  const providerId = String(provider || '').trim();
  validateLanguageModelTestInput(providerId, clientConfig);

  const currentSettings = await loadLanguageModelSettings();
  const providerSettings = getLanguageModelProviderCard(currentSettings, providerId);
  if (!providerSettings) {
    return {
      success: false,
      message: '未找到该 Provider 的配置',
      providerId,
    };
  }

  // 从当前配置中找到对应的模型
  const currentModel =
    providerSettings.models?.find((item) => item.id === modelId)
    || providerSettings.models?.find((item) => item.id === providerSettings.selectedModelId)
    || providerSettings.models?.[0];

  // 合并客户端传入的配置（测试表单中的值）与持久化的模型配置
  const mergedModelConfig = {
    ...currentModel,
    ...clientConfig,
    id: clientConfig?.id || modelId,
    model: clientConfig?.model || currentModel?.model,
    name: clientConfig?.name || currentModel?.name,
  };

  const rawApiKey = typeof clientConfig?.apiKey === 'string' ? clientConfig.apiKey.trim() : '';
  const shouldClearApiKey =
    Object.prototype.hasOwnProperty.call(clientConfig || {}, 'apiKeyConfigured')
    && clientConfig.apiKeyConfigured === false
    && !rawApiKey;
  const runtimeProviderSettings = {
    ...providerSettings,
    apiKey: rawApiKey
      ? rawApiKey
      : shouldClearApiKey
        ? ''
        : providerSettings.apiKey,
    apiKeyConfigured:
      typeof clientConfig?.apiKeyConfigured === 'boolean'
        ? clientConfig.apiKeyConfigured
        : providerSettings.apiKeyConfigured,
    baseUrl:
      typeof clientConfig?.baseUrl === 'string'
        ? clientConfig.baseUrl.replace(/\/$/, '')
        : providerSettings.baseUrl,
    apiFormat:
      clientConfig?.apiFormat === 'openai' || clientConfig?.apiFormat === 'anthropic'
        ? clientConfig.apiFormat
        : providerSettings.apiFormat,
  };

  // 构建运行时完整配置
  const runtimeConfig = resolveProviderConfig(runtimeProviderSettings, mergedModelConfig);

  try {
    if (runtimeConfig.kind === 'custom' || runtimeConfig.presetType === 'openai' || runtimeConfig.presetType === 'qwen' || runtimeConfig.presetType === 'zhipu') {
      const providerLabel = runtimeConfig.providerName || runtimeConfig.presetType || 'Provider';
      return await testOpenAICompatibleChat(providerLabel, runtimeConfig);
    }

    if (runtimeConfig.presetType === 'claude') {
      return await testClaudeConnection(runtimeConfig);
    }

    if (runtimeConfig.presetType === 'anthropic-third-party') {
      return await testAnthropicThirdPartyConnection(runtimeConfig);
    }

    if (runtimeConfig.presetType === 'gemini') {
      return await testGeminiConnection(runtimeConfig);
    }

    throw new Error('不支持的语言模型 Provider');
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        success: false,
        message: '连接超时',
        providerId: runtimeConfig.providerId,
        providerName: runtimeConfig.providerName,
        modelId: runtimeConfig.id,
      };
    }

    return {
      success: false,
      message: error instanceof Error ? error.message : '连接测试失败',
      providerId: runtimeConfig.providerId,
      providerName: runtimeConfig.providerName,
      modelId: runtimeConfig.id,
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
