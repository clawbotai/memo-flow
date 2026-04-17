'use strict';

const {
  EXPORT_ERROR_CODES,
  ExportError,
  isExportError,
  createExportResult,
} = require('../types');

const IMA_BASE_URL = 'https://ima.qq.com/openapi/note/v1';
const REQUEST_TIMEOUT_MS = 15000;
const MAX_NETWORK_RETRIES = 2;

function isRetryableError(error) {
  if (isExportError(error)) {
    return error.code === EXPORT_ERROR_CODES.NETWORK_TIMEOUT;
  }

  return error?.name === 'AbortError' || error instanceof TypeError;
}

function detectImaErrorCode(payload) {
  const candidates = [
    payload?.code,
    payload?.ret,
    payload?.retcode,
    payload?.errcode,
    payload?.status,
  ];

  for (const candidate of candidates) {
    if (candidate == null || candidate === '' || candidate === '0' || candidate === 0 || candidate === 'success') {
      continue;
    }
    return String(candidate);
  }

  return '';
}

function extractImaMessage(payload, fallback) {
  return String(
    payload?.message ||
      payload?.msg ||
      payload?.errmsg ||
      payload?.error ||
      fallback ||
      'IMA 导出失败',
  ).trim();
}

function ensureConfigured(config) {
  if (!config?.clientId || !config?.apiKey) {
    throw new ExportError(
      EXPORT_ERROR_CODES.PLATFORM_NOT_CONFIGURED,
      'IMA 未配置 Client ID 或 API Key',
    );
  }
}

async function postIma(endpoint, body, config) {
  ensureConfigured(config);

  let lastError = null;
  for (let attempt = 0; attempt <= MAX_NETWORK_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${IMA_BASE_URL}/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ima-openapi-clientid': config.clientId,
          'ima-openapi-apikey': config.apiKey,
        },
        body: JSON.stringify(body || {}),
        signal: controller.signal,
      });

      const rawText = await response.text();
      let payload = {};
      try {
        payload = rawText ? JSON.parse(rawText) : {};
      } catch {
        payload = { rawText };
      }

      if (!response.ok) {
        const message = extractImaMessage(payload, `IMA 请求失败 (${response.status})`);
        const code = response.status === 401 || response.status === 403
          ? EXPORT_ERROR_CODES.AUTH_FAILED
          : EXPORT_ERROR_CODES.PLATFORM_ERROR;
        throw new ExportError(code, message, { responseStatus: response.status, payload });
      }

      const imaCode = detectImaErrorCode(payload);
      if (imaCode) {
        const message = extractImaMessage(payload, 'IMA 平台返回错误');
        const code = /auth|token|apikey|clientid|401|403/i.test(`${imaCode} ${message}`)
          ? EXPORT_ERROR_CODES.AUTH_FAILED
          : EXPORT_ERROR_CODES.PLATFORM_ERROR;
        throw new ExportError(code, message, { imaCode, payload });
      }

      return payload;
    } catch (error) {
      lastError = error;

      if (error?.name === 'AbortError') {
        lastError = new ExportError(
          EXPORT_ERROR_CODES.NETWORK_TIMEOUT,
          'IMA 请求超时，请稍后重试',
        );
      } else if (!isExportError(error) && error instanceof TypeError) {
        lastError = new ExportError(
          EXPORT_ERROR_CODES.NETWORK_TIMEOUT,
          '连接 IMA 服务失败，请检查网络后重试',
        );
      }

      if (attempt >= MAX_NETWORK_RETRIES || !isRetryableError(lastError)) {
        throw lastError;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new ExportError(EXPORT_ERROR_CODES.PLATFORM_ERROR, 'IMA 请求失败');
}

function extractTargetRef(payload) {
  const candidates = [
    payload?.data?.doc_id,
    payload?.data?.docId,
    payload?.data?.note_id,
    payload?.data?.noteId,
    payload?.doc_id,
    payload?.docId,
  ];

  for (const candidate of candidates) {
    if (candidate) {
      return String(candidate);
    }
  }

  return undefined;
}

const imaProvider = {
  id: 'ima',
  getMeta(config) {
    return {
      id: 'ima',
      name: 'IMA 笔记',
      description: '通过 IMA OpenAPI 导出 Markdown 笔记',
      configured: Boolean(config?.clientId && config?.apiKey),
      supports: ['export', 'test'],
    };
  },
  async test(config) {
    await postIma('search_note_book', {
      search_type: 0,
      query_info: {
        title: 'MemoFlow',
      },
      start: 0,
      end: 1,
    }, config);

    return {
      providerId: 'ima',
      success: true,
      message: 'IMA 凭证可用',
    };
  },
  async execute({ markdown, config }) {
    const payload = await postIma('import_doc', {
      content_format: 1,
      content: markdown,
      ...(config.folderId ? { folder_id: config.folderId } : {}),
    }, config);

    return createExportResult('ima', {
      status: 'success',
      targetRef: extractTargetRef(payload),
      message: '已导出到 IMA 笔记',
    });
  },
};

module.exports = {
  imaProvider,
};
