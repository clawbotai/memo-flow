'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
const { MODEL_URLS, MODEL_SIZES } = require('./constants');
const { MODELS_DIR, ensureAppDirs } = require('./app-paths');
const { buildCorsHeaders, assertTrustedOrigin, sendJson, writeSse, openSse } = require('./cors-sse');
const {
  loadConfig,
  saveConfig,
  getDefaultModelName,
  getDefaultModelPath,
  sanitizeLanguageModelSettings,
  loadLanguageModelSettings,
  saveLanguageModelSettings,
  mergeLanguageModelSettings,
} = require('./config');
const {
  buildWhisperStatus,
  syncDetectedRuntimeIntoConfig,
  normalizeInstallComponents,
  installLocalRuntime,
  updateLocalRuntimeInstallProgress,
  appendLocalRuntimeInstallLogs,
} = require('./exec');
const {
  getLiveClientSet,
  listRecords,
  getRecord,
  removeRecord,
  reconcileInterruptedRecords,
  importMissingTranscriptHistory,
} = require('./history');
const {
  cancelTask,
  safeUnlink,
  testQwenASRConnection,
  testLanguageModelConnection,
  runNewTranscription,
  runRetranscription,
} = require('./transcription');
const state = require('./state');

// ─── Model download ────────────────────────────────────────────────────────────

function emitDownloadProgress() {
  for (const res of state.modelDownloadClients) {
    if (!writeSse(res, state.downloadProgress)) {
      state.modelDownloadClients.delete(res);
    }
  }
}

async function startModelDownload(modelName) {
  if (!MODEL_URLS[modelName]) {
    throw new Error(`不支持的模型: ${modelName}`);
  }

  if (state.downloadProgress.status === 'downloading') {
    throw new Error('已有模型下载任务进行中');
  }

  const targetPath = path.join(MODELS_DIR, `ggml-${modelName}.bin`);
  const tempPath = `${targetPath}.${Date.now()}.tmp`;

  state.downloadProgress = {
    status: 'downloading',
    downloaded: 0,
    total: MODEL_SIZES[modelName],
    modelName,
  };
  emitDownloadProgress();

  try {
    const response = await fetch(MODEL_URLS[modelName]);
    if (!response.ok || !response.body) {
      throw new Error(`下载失败: HTTP ${response.status}`);
    }

    const total = Number.parseInt(
      response.headers.get('content-length') || String(MODEL_SIZES[modelName]),
      10,
    );
    state.downloadProgress.total = total;
    emitDownloadProgress();

    await ensureAppDirs();
    const fileStream = fs.createWriteStream(tempPath);
    const reader = response.body.getReader();
    let downloadedSize = 0;
    let lastEmitAt = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fileStream.write(Buffer.from(value));
      downloadedSize += value.length;
      const now = Date.now();
      if (now - lastEmitAt > 300) {
        lastEmitAt = now;
        state.downloadProgress = {
          status: 'downloading',
          downloaded: downloadedSize,
          total,
          modelName,
        };
        emitDownloadProgress();
      }
    }

    await new Promise((resolve, reject) => {
      fileStream.end();
      fileStream.on('finish', resolve);
      fileStream.on('error', reject);
    });

    await fsp.rename(tempPath, targetPath);

    const config = await loadConfig();
    config.modelName = modelName;
    config.modelPath = targetPath;
    await saveConfig(config);

    state.downloadProgress = {
      status: 'completed',
      downloaded: total,
      total,
      modelName,
    };
    emitDownloadProgress();
  } catch (error) {
    await safeUnlink(tempPath);
    state.downloadProgress = {
      status: 'error',
      downloaded: 0,
      total: 0,
      modelName,
      error: error instanceof Error ? error.message : '模型下载失败',
    };
    emitDownloadProgress();
  }
}

// ─── HTTP utilities ───────────────────────────────────────────────────────────

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function parsePathname(req) {
  return new URL(req.url, `http://${req.headers.host}`).pathname;
}

function validateOnlineAsrRequest(engine, onlineASRConfig) {
  if (engine !== 'qwen-asr') {
    return null;
  }

  if (!String(onlineASRConfig?.apiKey || '').trim()) {
    return '千问 ASR API Key 未配置，请在设置中填写';
  }

  return null;
}

async function handleOptions(res) {
  res.writeHead(204, {
    ...(res.__memoFlowCorsHeaders || {}),
  });
  res.end();
}

// ─── Main request handler ─────────────────────────────────────────────────────

async function handleRequest(req, res) {
  res.__memoFlowCorsHeaders = buildCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    assertTrustedOrigin(req);
    await handleOptions(res);
    return;
  }

  const pathname = parsePathname(req);

  try {
    if (pathname !== '/health') {
      assertTrustedOrigin(req);
    }

    if (req.method === 'GET' && pathname === '/health') {
      sendJson(res, 200, {
        success: true,
        data: {
          helperConnected: true,
          platform: process.platform,
          installMode: 'mixed',
        },
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/config') {
      const config = await loadConfig();
      sendJson(res, 200, { success: true, data: config });
      return;
    }

    if (req.method === 'GET' && pathname === '/llm/config') {
      const settings = await loadLanguageModelSettings();
      sendJson(res, 200, { success: true, data: sanitizeLanguageModelSettings(settings) });
      return;
    }

    if (req.method === 'PUT' && pathname === '/config') {
      const body = await readJsonBody(req);
      const current = await loadConfig();
      const next = {
        ...current,
        ...body,
        modelName: body.modelName || current.modelName || getDefaultModelName(),
      };
      if (!next.modelPath) {
        next.modelPath = getDefaultModelPath(next.modelName);
      }
      next.threads = Math.max(1, Number.parseInt(String(next.threads || current.threads || 4), 10));
      if (Object.prototype.hasOwnProperty.call(body, 'whisperPath')) {
        next.whisperPathManaged = false;
      }
      if (Object.prototype.hasOwnProperty.call(body, 'ffmpegPath')) {
        next.ffmpegPathManaged = false;
      }
      await saveConfig(next);
      sendJson(res, 200, { success: true, data: next });
      return;
    }

    if (req.method === 'PUT' && pathname === '/llm/config') {
      const body = await readJsonBody(req);
      const current = await loadLanguageModelSettings();
      const next = mergeLanguageModelSettings(current, body);
      await saveLanguageModelSettings(next);
      sendJson(res, 200, { success: true, data: sanitizeLanguageModelSettings(next) });
      return;
    }

    if (req.method === 'GET' && pathname === '/whisper/status') {
      const config = await loadConfig();
      sendJson(res, 200, { success: true, data: buildWhisperStatus(config) });
      return;
    }

    if (req.method === 'POST' && pathname === '/local-runtime/install') {
      const body = await readJsonBody(req);
      const components = normalizeInstallComponents(body.components);

      if (!components.length) {
        sendJson(res, 400, { success: false, error: '未指定要安装的组件' });
        return;
      }

      if (process.platform !== 'darwin') {
        sendJson(res, 400, { success: false, error: '一键安装当前仅支持 macOS' });
        return;
      }

      if (state.localRuntimeInstallPromise) {
        sendJson(res, 409, { success: false, error: '已有安装任务正在运行' });
        return;
      }

      state.localRuntimeInstallPromise = installLocalRuntime(components)
        .catch((error) => {
          appendLocalRuntimeInstallLogs(
            error instanceof Error ? error.message : '本地依赖安装失败',
          );
          updateLocalRuntimeInstallProgress({
            status: 'failed',
            currentStep: state.localRuntimeInstallProgress.currentStep,
            message: error instanceof Error ? error.message : '本地依赖安装失败',
          });
        })
        .finally(() => {
          state.localRuntimeInstallPromise = null;
        });

      sendJson(res, 200, { success: true, data: { components } });
      return;
    }

    if (req.method === 'GET' && pathname === '/local-runtime/install-progress') {
      const heartbeat = openSse(res);
      state.localRuntimeInstallClients.add(res);
      writeSse(res, state.localRuntimeInstallProgress);
      req.on('close', () => {
        clearInterval(heartbeat);
        state.localRuntimeInstallClients.delete(res);
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/online-asr/test') {
      const body = await readJsonBody(req);
      const result = await testQwenASRConnection(body);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === 'POST' && pathname === '/llm/test') {
      const body = await readJsonBody(req);
      let result;
      try {
        result = await testLanguageModelConnection(body.provider, body.config);
      } catch (error) {
        sendJson(res, 400, {
          success: false,
          error: error instanceof Error ? error.message : '语言模型连接测试失败',
        });
        return;
      }
      sendJson(res, 200, { success: true, data: result });
      return;
    }

    if (req.method === 'POST' && pathname === '/whisper/model/download') {
      const body = await readJsonBody(req);
      const modelName = body.modelName || getDefaultModelName();
      startModelDownload(modelName).catch((error) => {
        state.downloadProgress = {
          status: 'error',
          downloaded: 0,
          total: 0,
          modelName,
          error: error instanceof Error ? error.message : '模型下载失败',
        };
        emitDownloadProgress();
      });
      sendJson(res, 200, { success: true, data: { modelName } });
      return;
    }

    if (req.method === 'GET' && pathname === '/whisper/model/download-progress') {
      const heartbeat = openSse(res);
      state.modelDownloadClients.add(res);
      writeSse(res, state.downloadProgress);
      req.on('close', () => {
        clearInterval(heartbeat);
        state.modelDownloadClients.delete(res);
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/transcriptions') {
      const records = await listRecords();
      sendJson(res, 200, { success: true, data: records });
      return;
    }

    if (req.method === 'POST' && pathname === '/transcriptions') {
      const body = await readJsonBody(req);
      if (!body.url) {
        sendJson(res, 400, { success: false, error: 'URL is required' });
        return;
      }
      const engine = body.engine || 'local-whisper';
      const onlineAsrError = validateOnlineAsrRequest(engine, body.onlineASRConfig);
      if (onlineAsrError) {
        sendJson(res, 400, { success: false, error: onlineAsrError });
        return;
      }
      const taskId = `${Date.now()}_${randomUUID().slice(0, 8)}`;
      runNewTranscription(taskId, body.url, engine, body.onlineASRConfig).catch(() => {});
      sendJson(res, 200, { success: true, data: { taskId } });
      return;
    }

    const transcriptionIdMatch = pathname.match(/^\/transcriptions\/([^/]+)$/);
    if (transcriptionIdMatch && req.method === 'GET') {
      const record = await getRecord(transcriptionIdMatch[1]);
      if (!record) {
        sendJson(res, 404, { success: false, error: '转录记录不存在' });
        return;
      }
      sendJson(res, 200, { success: true, data: record });
      return;
    }

    if (transcriptionIdMatch && req.method === 'DELETE') {
      const taskId = transcriptionIdMatch[1];
      const record = await getRecord(taskId);
      if (!record) {
        sendJson(res, 404, { success: false, error: '转录记录不存在' });
        return;
      }

      await cancelTask(taskId);

      if (record.savedPath) {
        try {
          await fsp.rm(record.savedPath, { recursive: true, force: true });
        } catch {}
      }

      await removeRecord(taskId);
      sendJson(res, 200, { success: true, data: { id: taskId } });
      return;
    }

    const liveMatch = pathname.match(/^\/transcriptions\/([^/]+)\/live$/);
    if (liveMatch && req.method === 'GET') {
      const taskId = liveMatch[1];
      const record = await getRecord(taskId);
      if (!record) {
        sendJson(res, 404, { success: false, error: '转录记录不存在' });
        return;
      }
      const heartbeat = openSse(res);
      const clients = getLiveClientSet(taskId);
      clients.add(res);
      writeSse(res, { success: true, data: record });
      req.on('close', () => {
        clearInterval(heartbeat);
        clients.delete(res);
      });
      return;
    }

    const retranscribeMatch = pathname.match(/^\/transcriptions\/([^/]+)\/retranscribe$/);
    if (retranscribeMatch && req.method === 'POST') {
      const taskId = retranscribeMatch[1];
      const body = await readJsonBody(req);
      const record = await getRecord(taskId);
      if (!record) {
        sendJson(res, 404, { success: false, error: '转录记录不存在' });
        return;
      }
      const engine = body.engine || 'local-whisper';
      const onlineAsrError = validateOnlineAsrRequest(engine, body.onlineASRConfig);
      if (onlineAsrError) {
        sendJson(res, 400, { success: false, error: onlineAsrError });
        return;
      }
      runRetranscription(taskId, engine, body.onlineASRConfig).catch(() => {});
      sendJson(res, 200, { success: true, data: { taskId } });
      return;
    }

    const cancelMatch = pathname.match(/^\/transcriptions\/([^/]+)\/cancel$/);
    if (cancelMatch && req.method === 'POST') {
      await cancelTask(cancelMatch[1]);
      sendJson(res, 200, { success: true });
      return;
    }

    sendJson(res, 404, { success: false, error: 'Not Found' });
  } catch (error) {
    sendJson(res, error?.statusCode || 500, {
      success: false,
      error: error instanceof Error ? error.message : 'helper 请求失败',
    });
  }
}

module.exports = { handleRequest };
