'use strict';

const EXPORT_PROVIDER_IDS = ['ima', 'obsidian'];

const EXPORT_ERROR_CODES = {
  PLATFORM_NOT_CONFIGURED: 'PLATFORM_NOT_CONFIGURED',
  CLI_NOT_FOUND: 'CLI_NOT_FOUND',
  CLI_EXECUTION_FAILED: 'CLI_EXECUTION_FAILED',
  AUTH_FAILED: 'AUTH_FAILED',
  NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
  PLATFORM_ERROR: 'PLATFORM_ERROR',
  EXPORT_SOURCE_NOT_READY: 'EXPORT_SOURCE_NOT_READY',
};

class ExportError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ExportError';
    this.code = code;
    this.details = details;
  }
}

function isExportError(error) {
  return error instanceof ExportError;
}

function createExportResult(providerId, payload = {}) {
  return {
    providerId,
    status: payload.status || 'success',
    exportedAt: payload.exportedAt || new Date().toISOString(),
    targetRef: payload.targetRef,
    message: payload.message,
    errorCode: payload.errorCode,
    errorMessage: payload.errorMessage,
  };
}

module.exports = {
  EXPORT_PROVIDER_IDS,
  EXPORT_ERROR_CODES,
  ExportError,
  isExportError,
  createExportResult,
};
