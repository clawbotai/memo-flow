'use strict';

const { getRecord } = require('../history');
const { buildExportPayload } = require('./format-transformer');
const {
  loadExportConfig,
  sanitizeProviderConfig,
  isProviderConfigured,
  normalizeProviderConfig,
} = require('./config-store');
const {
  EXPORT_PROVIDER_IDS,
  EXPORT_ERROR_CODES,
  ExportError,
} = require('./types');
const { imaProvider } = require('./providers/ima-provider');
const { obsidianCliProvider } = require('./providers/obsidian-cli-provider');

const providerRegistry = new Map([
  [imaProvider.id, imaProvider],
  [obsidianCliProvider.id, obsidianCliProvider],
]);

function getProvider(providerId) {
  const provider = providerRegistry.get(providerId);
  if (!provider) {
    throw new ExportError(
      EXPORT_ERROR_CODES.PLATFORM_ERROR,
      `不支持的导出平台: ${providerId}`,
    );
  }

  return provider;
}

async function listProviders() {
  const config = await loadExportConfig();
  return EXPORT_PROVIDER_IDS.map((providerId) => {
    const provider = getProvider(providerId);
    return {
      ...provider.getMeta(config.providers[providerId]),
      config: sanitizeProviderConfig(providerId, config.providers[providerId]),
    };
  });
}

async function getSanitizedConfig() {
  const config = await loadExportConfig();
  const providers = {};

  for (const providerId of EXPORT_PROVIDER_IDS) {
    providers[providerId] = sanitizeProviderConfig(providerId, config.providers[providerId]);
  }

  return { providers };
}

async function testProvider(providerId, configOverride) {
  const provider = getProvider(providerId);
  const config = await loadExportConfig();
  const providerConfig = normalizeProviderConfig(providerId, {
    ...(config.providers[providerId] || {}),
    ...(configOverride || {}),
  });

  if (!isProviderConfigured(providerId, providerConfig)) {
    throw new ExportError(
      EXPORT_ERROR_CODES.PLATFORM_NOT_CONFIGURED,
      `${provider.getMeta(providerConfig).name} 尚未完成配置`,
    );
  }

  return provider.test(providerConfig);
}

async function executeExport(recordId, providerId) {
  const provider = getProvider(providerId);
  const record = await getRecord(recordId);

  if (!record) {
    throw new ExportError(EXPORT_ERROR_CODES.PLATFORM_ERROR, '转录记录不存在');
  }

  if (record.status !== 'completed') {
    throw new ExportError(
      EXPORT_ERROR_CODES.EXPORT_SOURCE_NOT_READY,
      '仅已完成的转录可导出',
    );
  }

  const config = await loadExportConfig();
  const providerConfig = config.providers[providerId];
  if (!isProviderConfigured(providerId, providerConfig)) {
    throw new ExportError(
      EXPORT_ERROR_CODES.PLATFORM_NOT_CONFIGURED,
      `${provider.getMeta(providerConfig).name} 尚未完成配置`,
    );
  }

  let payload;
  try {
    payload = await buildExportPayload(record);
  } catch (error) {
    throw new ExportError(
      EXPORT_ERROR_CODES.EXPORT_SOURCE_NOT_READY,
      error instanceof Error ? error.message : '当前转录尚未准备好导出',
    );
  }

  return provider.execute({
    record,
    markdown: payload.markdown,
    fileName: payload.fileName,
    config: providerConfig,
  });
}

module.exports = {
  getProvider,
  listProviders,
  getSanitizedConfig,
  testProvider,
  executeExport,
};
