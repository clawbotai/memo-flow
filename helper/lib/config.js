'use strict';

const fsp = require('fs/promises');
const os = require('os');
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

function getDefaultLanguageModelSettings() {
  return {
    providers: {
      openai: {
        apiKey: '',
        model: 'gpt-4.1-mini',
        baseUrl: 'https://api.openai.com/v1',
        temperature: 0.7,
        maxTokens: 4096,
        enabled: false,
      },
      claude: {
        apiKey: '',
        model: 'claude-sonnet-4-5',
        baseUrl: 'https://api.anthropic.com/v1',
        temperature: 0.7,
        maxTokens: 4096,
        enabled: false,
      },
      gemini: {
        apiKey: '',
        model: 'gemini-2.5-flash',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        temperature: 0.7,
        maxTokens: 4096,
        enabled: false,
      },
      qwen: {
        apiKey: '',
        model: 'qwen-plus',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        temperature: 0.7,
        maxTokens: 4096,
        enabled: false,
      },
      zhipu: {
        apiKey: '',
        model: 'glm-4.5-flash',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        temperature: 0.7,
        maxTokens: 4096,
        enabled: false,
      },
    },
  };
}

function normalizeLanguageModelProviderConfig(config, defaults) {
  const next = {
    ...defaults,
    ...(config || {}),
  };

  return {
    apiKey: normalizeProviderString(next.apiKey, defaults.apiKey),
    model: normalizeProviderString(next.model, defaults.model),
    baseUrl: normalizeProviderString(next.baseUrl, defaults.baseUrl).replace(/\/$/, ''),
    temperature: normalizeProviderNumber(next.temperature, defaults.temperature, 0, 2),
    maxTokens: Math.floor(
      normalizeProviderNumber(next.maxTokens, defaults.maxTokens, 1, 128000),
    ),
    enabled: normalizeProviderBoolean(next.enabled, defaults.enabled),
  };
}

function sanitizeLanguageModelProviderConfig(config) {
  return {
    ...config,
    apiKey: '',
    apiKeyConfigured: Boolean(String(config?.apiKey || '').trim()),
  };
}

function normalizeLanguageModelSettings(settings) {
  const defaults = getDefaultLanguageModelSettings();
  const sourceProviders = settings?.providers || {};
  const providers = {};

  for (const provider of LANGUAGE_MODEL_PROVIDERS) {
    providers[provider] = normalizeLanguageModelProviderConfig(
      sourceProviders[provider],
      defaults.providers[provider],
    );
  }

  return { providers };
}

function sanitizeLanguageModelSettings(settings) {
  const providers = {};

  for (const provider of LANGUAGE_MODEL_PROVIDERS) {
    providers[provider] = sanitizeLanguageModelProviderConfig(settings.providers[provider]);
  }

  return { providers };
}

async function loadLanguageModelSettings() {
  await ensureAppDirs();
  const defaults = getDefaultLanguageModelSettings();

  try {
    const raw = await fsp.readFile(LANGUAGE_MODEL_CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return normalizeLanguageModelSettings({
      ...defaults,
      ...parsed,
      providers: {
        ...defaults.providers,
        ...(parsed?.providers || {}),
      },
    });
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

function mergeLanguageModelProviderConfig(current, patch, defaults) {
  const next = {
    ...current,
    ...(patch || {}),
  };
  const rawApiKey = typeof patch?.apiKey === 'string' ? patch.apiKey.trim() : '';
  const shouldClearApiKey =
    patch &&
    Object.prototype.hasOwnProperty.call(patch, 'apiKeyConfigured') &&
    patch.apiKeyConfigured === false &&
    !rawApiKey;

  if (rawApiKey) {
    next.apiKey = rawApiKey;
  } else if (shouldClearApiKey) {
    next.apiKey = '';
  } else {
    next.apiKey = current.apiKey;
  }

  delete next.apiKeyConfigured;
  return normalizeLanguageModelProviderConfig(next, defaults);
}

function mergeLanguageModelSettings(current, patch) {
  const defaults = getDefaultLanguageModelSettings();
  const sourceProviders = patch?.providers || {};
  const nextProviders = {};

  for (const provider of LANGUAGE_MODEL_PROVIDERS) {
    nextProviders[provider] = mergeLanguageModelProviderConfig(
      current.providers[provider],
      sourceProviders[provider],
      defaults.providers[provider],
    );
  }

  return normalizeLanguageModelSettings({ providers: nextProviders });
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
  getDefaultLanguageModelSettings,
  normalizeLanguageModelProviderConfig,
  sanitizeLanguageModelProviderConfig,
  normalizeLanguageModelSettings,
  sanitizeLanguageModelSettings,
  loadLanguageModelSettings,
  saveLanguageModelSettings,
  mergeLanguageModelProviderConfig,
  mergeLanguageModelSettings,
};
