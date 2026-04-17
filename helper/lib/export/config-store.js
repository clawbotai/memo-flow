'use strict';

const fsp = require('fs/promises');
const path = require('path');
const { EXPORT_CONFIG_FILE, ensureAppDirs } = require('../app-paths');
const { EXPORT_PROVIDER_IDS, EXPORT_ERROR_CODES, ExportError } = require('./types');

function getDefaultExportConfig() {
  return {
    providers: {
      ima: {
        clientId: '',
        apiKey: '',
        folderId: '',
        updatedAt: null,
      },
      obsidian: {
        cliPath: '',
        vaultPath: '',
        targetFolder: '',
        updatedAt: null,
      },
    },
  };
}

function normalizeString(value) {
  return String(value || '').trim();
}

function normalizeProviderConfig(providerId, config) {
  const src = config && typeof config === 'object' ? config : {};

  if (providerId === 'ima') {
    return {
      clientId: normalizeString(src.clientId),
      apiKey: normalizeString(src.apiKey),
      folderId: normalizeString(src.folderId),
      updatedAt: src.updatedAt || null,
    };
  }

  if (providerId === 'obsidian') {
    return {
      cliPath: normalizeString(src.cliPath),
      vaultPath: normalizeString(src.vaultPath),
      targetFolder: normalizeString(src.targetFolder).replace(/^\/+|\/+$/g, ''),
      updatedAt: src.updatedAt || null,
    };
  }

  return {};
}

function assertSupportedProviderId(providerId) {
  if (!EXPORT_PROVIDER_IDS.includes(providerId)) {
    throw new ExportError(
      EXPORT_ERROR_CODES.PLATFORM_ERROR,
      `不支持的导出平台: ${providerId}`,
    );
  }
}

function normalizeExportConfig(config) {
  const defaults = getDefaultExportConfig();
  const sourceProviders = config?.providers && typeof config.providers === 'object'
    ? config.providers
    : {};

  const providers = {};
  for (const providerId of EXPORT_PROVIDER_IDS) {
    providers[providerId] = normalizeProviderConfig(providerId, {
      ...defaults.providers[providerId],
      ...(sourceProviders[providerId] || {}),
    });
  }

  return { providers };
}

function isProviderConfigured(providerId, config) {
  if (providerId === 'ima') {
    return Boolean(config?.clientId && config?.apiKey);
  }

  if (providerId === 'obsidian') {
    return Boolean(config?.vaultPath);
  }

  return false;
}

function sanitizeProviderConfig(providerId, config) {
  const normalized = normalizeProviderConfig(providerId, config);

  if (providerId === 'ima') {
    return {
      clientId: normalized.clientId,
      apiKeyConfigured: Boolean(normalized.apiKey),
      folderId: normalized.folderId,
      updatedAt: normalized.updatedAt,
      configured: isProviderConfigured(providerId, normalized),
    };
  }

  if (providerId === 'obsidian') {
    return {
      cliPath: normalized.cliPath,
      vaultPath: normalized.vaultPath,
      targetFolder: normalized.targetFolder,
      updatedAt: normalized.updatedAt,
      configured: isProviderConfigured(providerId, normalized),
    };
  }

  return normalized;
}

function sanitizeExportConfig(config) {
  const normalized = normalizeExportConfig(config);
  const providers = {};

  for (const providerId of EXPORT_PROVIDER_IDS) {
    providers[providerId] = sanitizeProviderConfig(providerId, normalized.providers[providerId]);
  }

  return { providers };
}

async function loadExportConfig() {
  await ensureAppDirs();
  const defaults = getDefaultExportConfig();

  try {
    const raw = await fsp.readFile(EXPORT_CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return normalizeExportConfig(parsed);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      await saveExportConfig(defaults);
      return defaults;
    }
    throw error;
  }
}

async function saveExportConfig(config) {
  await ensureAppDirs();
  const normalized = normalizeExportConfig(config);
  const directory = path.dirname(EXPORT_CONFIG_FILE);
  await fsp.mkdir(directory, { recursive: true });
  await fsp.writeFile(EXPORT_CONFIG_FILE, JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
}

async function saveProviderConfig(providerId, patch) {
  assertSupportedProviderId(providerId);
  const current = await loadExportConfig();
  const next = normalizeExportConfig(current);
  next.providers[providerId] = normalizeProviderConfig(providerId, {
    ...next.providers[providerId],
    ...(patch || {}),
    updatedAt: new Date().toISOString(),
  });
  await saveExportConfig(next);
  return next.providers[providerId];
}

module.exports = {
  getDefaultExportConfig,
  normalizeProviderConfig,
  normalizeExportConfig,
  isProviderConfigured,
  sanitizeProviderConfig,
  sanitizeExportConfig,
  loadExportConfig,
  saveExportConfig,
  saveProviderConfig,
  assertSupportedProviderId,
};
