'use strict';

const fsp = require('fs/promises');
const os = require('os');
const { randomUUID } = require('crypto');
const { LANGUAGE_MODEL_PROVIDERS } = require('./constants');
const { APP_DIR, MODELS_DIR, CONFIG_FILE, LANGUAGE_MODEL_CONFIG_FILE, ensureAppDirs } = require('./app-paths');

// ─── Whisper config ──────────────────────────────────────────────────────────

function getDefaultModelName() {
  return 'small';
}

function getDefaultWhisperPath() {
  return process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
}

function getDefaultFfmpegPath() {
  return process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
}

function isDefaultBinaryConfigPath(kind, inputPath) {
  if (!inputPath) return true;
  const expected = kind === 'whisper' ? getDefaultWhisperPath() : getDefaultFfmpegPath();
  return String(inputPath).trim() === expected;
}

function getDefaultOutputDir() {
  const path = require('path');
  return path.join(os.homedir(), 'Documents', 'MemoFlow Transcripts');
}

function getDefaultModelPath(modelName = getDefaultModelName()) {
  const path = require('path');
  return path.join(MODELS_DIR, `ggml-${modelName}.bin`);
}

function getWhisperThreadLimit() {
  const cpuCount = os.cpus()?.length || 4;
  return Math.max(1, Math.min(8, cpuCount));
}

function normalizeWhisperThreads(input) {
  const parsed = Number.parseInt(String(input || 0), 10);
  const safeValue = Number.isNaN(parsed) ? Math.max(1, Math.floor(getWhisperThreadLimit() / 2)) : parsed;
  return Math.max(1, Math.min(getWhisperThreadLimit(), safeValue));
}

function normalizeConfig(config) {
  const next = { ...config };
  next.modelName = next.modelName || getDefaultModelName();
  next.modelPath = next.modelPath || getDefaultModelPath(next.modelName);
  next.threads = normalizeWhisperThreads(next.threads);
  return next;
}

function getDefaultConfig() {
  return normalizeConfig({
    whisperPath: getDefaultWhisperPath(),
    modelPath: getDefaultModelPath(),
    modelName: getDefaultModelName(),
    threads: Math.max(1, Math.floor(getWhisperThreadLimit() / 2)),
    outputDir: getDefaultOutputDir(),
    ffmpegPath: getDefaultFfmpegPath(),
  });
}

async function loadConfig() {
  await ensureAppDirs();
  const defaults = getDefaultConfig();

  try {
    const raw = await fsp.readFile(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return normalizeConfig({ ...defaults, ...parsed });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      await saveConfig(defaults);
      return defaults;
    }
    throw error;
  }
}

async function saveConfig(config) {
  await ensureAppDirs();
  const normalized = normalizeConfig(config);
  await fsp.writeFile(CONFIG_FILE, JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
}

// ─── Language model config ────────────────────────────────────────────────────

function normalizeProviderString(input, fallback) {
  const value = String(input || '').trim();
  return value || fallback;
}

function normalizeProviderNumber(input, fallback, min, max) {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function normalizeProviderBoolean(input, fallback = false) {
  if (typeof input === 'boolean') {
    return input;
  }
  if (input === 'true') return true;
  if (input === 'false') return false;
  return fallback;
}

function createLanguageModelConfigId(providerId = 'provider') {
  return `${providerId}-${randomUUID().slice(0, 8)}`;
}

function createLanguageModelProviderCardId(kind, presetType) {
  if (kind === 'preset' && presetType) {
    return `preset:${presetType}`;
  }
  return `provider-${randomUUID().slice(0, 8)}`;
}

function isPresetProvider(value) {
  return typeof value === 'string' && LANGUAGE_MODEL_PROVIDERS.includes(value);
}

function getDefaultsProvider(provider) {
  return isPresetProvider(provider) ? provider : 'openai';
}

function getProviderLabel(provider) {
  const labels = {
    openai: 'OpenAI',
    claude: 'Claude',
    'anthropic-third-party': 'Third-party API',
    gemini: 'Google Gemini',
    qwen: 'Qwen',
    zhipu: 'ZhiPu AI',
  };
  return labels[provider] || 'Untitled Provider';
}

const DEFAULT_PROVIDER_CONNECTIONS = {
  openai: {
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    apiFormat: 'openai',
  },
  claude: {
    apiKey: '',
    baseUrl: 'https://api.anthropic.com/v1',
    apiFormat: 'anthropic',
  },
  'anthropic-third-party': {
    apiKey: '',
    baseUrl: '',
    apiFormat: 'openai',
  },
  gemini: {
    apiKey: '',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiFormat: 'openai',
  },
  qwen: {
    apiKey: '',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiFormat: 'openai',
  },
  zhipu: {
    apiKey: '',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    apiFormat: 'openai',
  },
};

const DEFAULT_MODEL_CONFIGS = {
  openai: {
    model: 'gpt-4.1-mini',
    temperature: 0.7,
    maxTokens: 4096,
    enabled: false,
  },
  claude: {
    model: 'claude-sonnet-4-5',
    temperature: 0.7,
    maxTokens: 4096,
    enabled: false,
  },
  'anthropic-third-party': {
    model: 'claude-sonnet-4-5',
    temperature: 0.7,
    maxTokens: 4096,
    enabled: false,
  },
  gemini: {
    model: 'gemini-2.5-flash',
    temperature: 0.7,
    maxTokens: 4096,
    enabled: false,
  },
  qwen: {
    model: 'qwen-plus',
    temperature: 0.7,
    maxTokens: 4096,
    enabled: false,
  },
  zhipu: {
    model: 'glm-4.5-flash',
    temperature: 0.7,
    maxTokens: 4096,
    enabled: false,
  },
};

function getDefaultLanguageModelProviderConfig(provider, overrides = {}) {
  const defaultsProvider = getDefaultsProvider(provider);
  const modelDefaults = DEFAULT_MODEL_CONFIGS[defaultsProvider];
  const model = normalizeProviderString(overrides.model, modelDefaults.model);
  return {
    id: normalizeProviderString(overrides.id, createLanguageModelConfigId(defaultsProvider)),
    name: normalizeProviderString(overrides.name, model),
    model,
    temperature: normalizeProviderNumber(overrides.temperature, modelDefaults.temperature, 0, 2),
    maxTokens: Math.floor(normalizeProviderNumber(overrides.maxTokens, modelDefaults.maxTokens, 1, 128000)),
    enabled: normalizeProviderBoolean(overrides.enabled, modelDefaults.enabled),
  };
}

function createDefaultPresetProviderCard(provider) {
  const conn = DEFAULT_PROVIDER_CONNECTIONS[provider];
  const defaultModel = getDefaultLanguageModelProviderConfig(provider);
  return {
    id: createLanguageModelProviderCardId('preset', provider),
    kind: 'preset',
    presetType: provider,
    name: getProviderLabel(provider),
    apiKey: conn.apiKey,
    baseUrl: conn.baseUrl,
    apiFormat: conn.apiFormat,
    selectedModelId: defaultModel.id,
    models: [defaultModel],
  };
}

function createDefaultCustomProviderCard() {
  const defaultModel = getDefaultLanguageModelProviderConfig('openai', {
    name: 'Default Model',
    model: '',
  });
  return {
    id: createLanguageModelProviderCardId('custom'),
    kind: 'custom',
    name: 'Untitled Provider',
    apiKey: '',
    baseUrl: '',
    apiFormat: 'openai',
    selectedModelId: defaultModel.id,
    models: [defaultModel],
  };
}

function getDefaultLanguageModelSettings() {
  return {
    providers: LANGUAGE_MODEL_PROVIDERS.map((provider) => createDefaultPresetProviderCard(provider)),
  };
}

function normalizeLanguageModelModelConfig(config, defaults, provider = 'openai') {
  const next = {
    ...defaults,
    ...(config || {}),
  };
  const model = normalizeProviderString(next.model, defaults.model);

  return {
    id: normalizeProviderString(next.id, createLanguageModelConfigId(provider)),
    name: normalizeProviderString(next.name, model),
    model,
    temperature: normalizeProviderNumber(next.temperature, defaults.temperature, 0, 2),
    maxTokens: Math.floor(
      normalizeProviderNumber(next.maxTokens, defaults.maxTokens, 1, 128000),
    ),
    enabled: normalizeProviderBoolean(next.enabled, defaults.enabled),
  };
}

function normalizeLanguageModelProviderSettings(settings, fallbackPresetType) {
  const src = settings && typeof settings === 'object' ? settings : {};
  const presetType = isPresetProvider(src.presetType) ? src.presetType : fallbackPresetType;
  const kind = presetType || src.kind === 'preset' ? 'preset' : 'custom';
  const defaultsProvider = getDefaultsProvider(presetType);
  const defaults = kind === 'preset' && presetType
    ? createDefaultPresetProviderCard(presetType)
    : createDefaultCustomProviderCard();
  const legacyFlat = !Array.isArray(src.models) && typeof src.model === 'string';
  const legacyFirstModel = legacyFlat
    ? src
    : (Array.isArray(src.models) ? src.models[0] : null) || {};
  const sourceModels = Array.isArray(src.models)
    ? src.models
    : legacyFlat
      ? [src]
      : [];
  const models = sourceModels.length > 0
    ? sourceModels.map((item) =>
        normalizeLanguageModelModelConfig(
          item,
          {
            id: item?.id || createLanguageModelConfigId(defaultsProvider),
            name: item?.name || DEFAULT_MODEL_CONFIGS[defaultsProvider].model,
            ...DEFAULT_MODEL_CONFIGS[defaultsProvider],
          },
          defaultsProvider,
        ))
    : defaults.models;
  const selectedModelId = normalizeProviderString(src.selectedModelId, models[0]?.id || defaults.selectedModelId);

  return {
    id: normalizeProviderString(
      src.id,
      kind === 'preset' && presetType
        ? createLanguageModelProviderCardId('preset', presetType)
        : createLanguageModelProviderCardId('custom'),
    ),
    kind,
    ...(presetType ? { presetType } : {}),
    name: normalizeProviderString(src.name, defaults.name),
    apiKey: normalizeProviderString(
      src.apiKey,
      normalizeProviderString(legacyFirstModel?.apiKey, defaults.apiKey),
    ),
    ...(typeof src.apiKeyConfigured === 'boolean'
      ? { apiKeyConfigured: src.apiKeyConfigured }
      : typeof legacyFirstModel?.apiKeyConfigured === 'boolean'
        ? { apiKeyConfigured: legacyFirstModel.apiKeyConfigured }
        : {}),
    baseUrl: normalizeProviderString(
      src.baseUrl,
      normalizeProviderString(legacyFirstModel?.baseUrl, defaults.baseUrl),
    ).replace(/\/$/, ''),
    apiFormat: defaults.apiFormat,
    selectedModelId:
      models.some((item) => item.id === selectedModelId)
        ? selectedModelId
        : models[0]?.id || defaults.selectedModelId,
    models,
  };
}

function getLanguageModelProviderCard(settings, providerId) {
  return settings?.providers?.find((provider) => provider.id === providerId);
}

function sanitizeLanguageModelModelConfig(config) {
  const { apiKey, baseUrl, apiFormat, ...rest } = config || {};
  return rest;
}

function sanitizeLanguageModelProviderConfig(config) {
  return {
    ...config,
    apiKey: '',
    apiKeyConfigured: Boolean(String(config?.apiKey || '').trim()),
    models: Array.isArray(config?.models)
      ? config.models.map((item) => sanitizeLanguageModelModelConfig(item))
      : [],
  };
}

function normalizeLanguageModelSettings(settings) {
  const sourceProviders = Array.isArray(settings?.providers) ? settings.providers : [];
  const legacyProviders =
    !Array.isArray(settings?.providers) && settings?.providers && typeof settings.providers === 'object'
      ? settings.providers
      : {};

  const presets = LANGUAGE_MODEL_PROVIDERS.map((provider) => {
    const source = sourceProviders.find((item) => item?.presetType === provider) || legacyProviders[provider];
    return normalizeLanguageModelProviderSettings(source, provider);
  });

  const customs = sourceProviders
    .filter((provider) => provider?.kind === 'custom')
    .map((provider) => normalizeLanguageModelProviderSettings(provider))
    .filter((provider, index, list) => list.findIndex((candidate) => candidate.id === provider.id) === index);

  return {
    providers: presets.concat(customs),
  };
}

function sanitizeLanguageModelSettings(settings) {
  return {
    providers: settings.providers.map((provider) => sanitizeLanguageModelProviderConfig(provider)),
  };
}

async function loadLanguageModelSettings() {
  await ensureAppDirs();
  const defaults = getDefaultLanguageModelSettings();

  try {
    const raw = await fsp.readFile(LANGUAGE_MODEL_CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return normalizeLanguageModelSettings(parsed);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      await saveLanguageModelSettings(defaults);
      return defaults;
    }
    throw error;
  }
}

async function saveLanguageModelSettings(settings) {
  await ensureAppDirs();
  const normalized = normalizeLanguageModelSettings(settings);
  await fsp.writeFile(
    LANGUAGE_MODEL_CONFIG_FILE,
    JSON.stringify(normalized, null, 2),
    'utf8',
  );
  return normalized;
}

function mergeLanguageModelModelConfig(current, patch, defaults, provider = 'openai') {
  const next = {
    ...current,
    ...(patch || {}),
  };
  const model = normalizeProviderString(next.model, defaults.model);

  return {
    id: normalizeProviderString(next.id, createLanguageModelConfigId(provider)),
    name: normalizeProviderString(next.name, model),
    model,
    temperature: normalizeProviderNumber(next.temperature, defaults.temperature, 0, 2),
    maxTokens: Math.floor(
      normalizeProviderNumber(next.maxTokens, defaults.maxTokens, 1, 128000),
    ),
    enabled: normalizeProviderBoolean(next.enabled, defaults.enabled),
  };
}

function mergeLanguageModelProviderSettings(current, patch, fallbackPresetType) {
  const normalizedCurrent = normalizeLanguageModelProviderSettings(current, fallbackPresetType);
  if (!patch) {
    return normalizedCurrent;
  }

  const normalizedPatch = normalizeLanguageModelProviderSettings(patch, fallbackPresetType);
  const defaultsProvider = getDefaultsProvider(normalizedPatch.presetType || normalizedCurrent.presetType);
  const rawApiKey = typeof patch.apiKey === 'string' ? patch.apiKey.trim() : '';
  const shouldClearApiKey =
    Object.prototype.hasOwnProperty.call(patch, 'apiKeyConfigured')
    && patch.apiKeyConfigured === false
    && !rawApiKey;
  const sourceModels = Array.isArray(patch.models)
    ? patch.models
    : (!Array.isArray(patch?.models) && typeof patch === 'object' && patch?.model)
      ? [patch]
      : null;
  const currentById = new Map(normalizedCurrent.models.map((item) => [item.id, item]));
  const models = sourceModels && sourceModels.length > 0
    ? sourceModels.map((item) => {
        const modelId = normalizeProviderString(item?.id, createLanguageModelConfigId(defaultsProvider));
        return mergeLanguageModelModelConfig(
          currentById.get(modelId) || {},
          { ...item, id: modelId },
          {
            id: modelId,
            name: DEFAULT_MODEL_CONFIGS[defaultsProvider].model,
            ...DEFAULT_MODEL_CONFIGS[defaultsProvider],
          },
          defaultsProvider,
        );
      })
    : normalizedPatch.models;
  const selectedModelId = normalizeProviderString(
    patch.selectedModelId,
    normalizedPatch.selectedModelId || normalizedCurrent.selectedModelId,
  );

  return normalizeLanguageModelProviderSettings({
    ...normalizedPatch,
    id: normalizedCurrent.id || normalizedPatch.id,
    apiKey: rawApiKey
      ? rawApiKey
      : shouldClearApiKey
        ? ''
        : normalizedCurrent.apiKey,
    apiKeyConfigured:
      typeof patch.apiKeyConfigured === 'boolean'
        ? patch.apiKeyConfigured
        : normalizedCurrent.apiKeyConfigured,
    baseUrl: typeof patch.baseUrl === 'string'
      ? patch.baseUrl.replace(/\/$/, '')
      : normalizedPatch.baseUrl,
    selectedModelId,
    models: models.length > 0 ? models : normalizedCurrent.models,
  }, fallbackPresetType);
}

function mergeLanguageModelSettings(current, patch) {
  const normalizedCurrent = normalizeLanguageModelSettings(current);
  const patchProviders = Array.isArray(patch?.providers) ? patch.providers : [];

  const presets = LANGUAGE_MODEL_PROVIDERS.map((provider) => {
    const currentProvider = normalizedCurrent.providers.find((item) => item.presetType === provider);
    const patchProvider = patchProviders.find((item) => item?.presetType === provider);
    return mergeLanguageModelProviderSettings(currentProvider, patchProvider, provider);
  });

  const currentCustoms = normalizedCurrent.providers.filter((provider) => provider.kind === 'custom');
  const patchCustoms = patchProviders.filter((provider) => provider?.kind === 'custom');
  const customs = patchCustoms.map((provider) => {
    const currentProvider = currentCustoms.find((item) => item.id === provider.id);
    return mergeLanguageModelProviderSettings(currentProvider, provider);
  });

  return normalizeLanguageModelSettings({ providers: presets.concat(customs) });
}

module.exports = {
  getDefaultModelName,
  getDefaultWhisperPath,
  getDefaultFfmpegPath,
  isDefaultBinaryConfigPath,
  getDefaultOutputDir,
  getDefaultModelPath,
  getWhisperThreadLimit,
  normalizeWhisperThreads,
  normalizeConfig,
  getDefaultConfig,
  loadConfig,
  saveConfig,
  createLanguageModelConfigId,
  getDefaultLanguageModelProviderConfig,
  getDefaultLanguageModelSettings,
  normalizeLanguageModelModelConfig,
  normalizeLanguageModelProviderSettings,
  getLanguageModelProviderCard,
  sanitizeLanguageModelModelConfig,
  sanitizeLanguageModelProviderConfig,
  normalizeLanguageModelSettings,
  sanitizeLanguageModelSettings,
  loadLanguageModelSettings,
  saveLanguageModelSettings,
  mergeLanguageModelModelConfig,
  mergeLanguageModelProviderSettings,
  mergeLanguageModelSettings,
};
