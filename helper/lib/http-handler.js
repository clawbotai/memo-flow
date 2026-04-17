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
  listProviders: listExportProviders,
  getSanitizedConfig: getSanitizedExportConfig,
  testProvider: testExportProvider,
  executeExport,
  saveProviderConfig: saveExportProviderConfig,
  sanitizeProviderConfig,
  EXPORT_ERROR_CODES,
  ExportError,
  isExportError,
} = require('./export');
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
  createRecordUpdateEmitter,
} = require('./history');
const {
  cancelTask,
  safeUnlink,
  testQwenASRConnection,
  testLanguageModelConnection,
  loadContentPoints,
  saveContentPoints,
  extractContentPoints,
  loadContentDrafts,
  saveContentDraft,
  generatePlatformContent,
  readMindMapDocument,
  writeMindMapDocument,
  generateMindMapDocument,
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

    if (req.method === 'GET' && pathname === '/export/providers') {
      const providers = await listExportProviders();
      sendJson(res, 200, { success: true, data: { providers } });
      return;
    }

    if (req.method === 'GET' && pathname === '/export/config') {
      const config = await getSanitizedExportConfig();
      sendJson(res, 200, { success: true, data: config });
      return;
    }

    const exportConfigMatch = pathname.match(/^\/export\/config\/([^/]+)$/);
    if (exportConfigMatch && req.method === 'PUT') {
      const providerId = exportConfigMatch[1];
      const body = await readJsonBody(req);
      const saved = await saveExportProviderConfig(providerId, body);
      sendJson(res, 200, {
        success: true,
        data: {
          providerId,
          config: sanitizeProviderConfig(providerId, saved),
        },
      });
      return;
    }

    const exportConfigTestMatch = pathname.match(/^\/export\/config\/([^/]+)\/test$/);
    if (exportConfigTestMatch && req.method === 'POST') {
      const providerId = exportConfigTestMatch[1];
      const body = await readJsonBody(req);
      const result = await testExportProvider(providerId, body);
      sendJson(res, 200, { success: true, data: result });
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
        const modelId = typeof body.modelId === 'string' ? body.modelId : body?.config?.id;
        result = await testLanguageModelConnection(body.providerId, modelId, body.config);
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

    const transcriptionExportMatch = pathname.match(/^\/transcriptions\/([^/]+)\/export$/);
    if (transcriptionExportMatch && req.method === 'POST') {
      const taskId = transcriptionExportMatch[1];
      const body = await readJsonBody(req);
      const providerId = typeof body.providerId === 'string' ? body.providerId : '';
      if (!providerId) {
        sendJson(res, 400, { success: false, error: '未指定导出平台' });
        return;
      }

      const updateRecord = createRecordUpdateEmitter(taskId);
      try {
        const result = await executeExport(taskId, providerId);
        await updateRecord({
          exportState: {
            ...((await getRecord(taskId))?.exportState || {}),
            [providerId]: {
              status: result.status,
              exportedAt: result.exportedAt,
              targetRef: result.targetRef,
              errorMessage: result.errorMessage,
            },
          },
        });
        sendJson(res, 200, { success: true, data: result });
      } catch (error) {
        await updateRecord({
          exportState: {
            ...((await getRecord(taskId))?.exportState || {}),
            [providerId]: {
              status: 'failed',
              exportedAt: new Date().toISOString(),
              errorMessage: error instanceof Error ? error.message : '导出失败',
            },
          },
        });
        throw error;
      }
      return;
    }

    const mindmapMatch = pathname.match(/^\/transcriptions\/([^/]+)\/mindmap$/);
    if (mindmapMatch && req.method === 'GET') {
      const taskId = mindmapMatch[1];
      const record = await getRecord(taskId);
      if (!record) {
        sendJson(res, 404, { success: false, error: '转录记录不存在' });
        return;
      }
      if (!record.mindmapPath && !record.savedPath) {
        sendJson(res, 404, { success: false, error: '当前转录尚未生成思维导图' });
        return;
      }

      try {
        const document = await readMindMapDocument(record.savedPath || path.dirname(record.mindmapPath));
        sendJson(res, 200, { success: true, data: { document } });
      } catch (error) {
        sendJson(res, 404, {
          success: false,
          error: error instanceof Error ? error.message : '思维导图不存在',
        });
      }
      return;
    }

    if (mindmapMatch && req.method === 'POST') {
      const taskId = mindmapMatch[1];
      const body = await readJsonBody(req);
      const record = await getRecord(taskId);
      if (!record) {
        sendJson(res, 404, { success: false, error: '转录记录不存在' });
        return;
      }
      if (record.status !== 'completed') {
        sendJson(res, 400, { success: false, error: '仅已完成的转录可生成思维导图' });
        return;
      }
      if (!record.savedPath) {
        sendJson(res, 400, { success: false, error: '当前转录缺少保存目录，无法生成思维导图' });
        return;
      }
      if (!body.providerId) {
        sendJson(res, 400, { success: false, error: '未指定语言模型 Provider' });
        return;
      }

      const updateRecord = createRecordUpdateEmitter(taskId);
      const hadMindmap = Boolean(record.mindmapPath);

      await updateRecord({
        mindmapStatus: 'generating',
        mindmapError: undefined,
      });

      try {
        const { document, generator } = await generateMindMapDocument(
          record,
          body.providerId,
          body.modelId,
        );
        const saved = await writeMindMapDocument(record.savedPath, document);
        await updateRecord({
          mindmapStatus: 'ready',
          mindmapUpdatedAt: new Date(),
          mindmapPath: saved.path,
          mindmapError: undefined,
          mindmapGenerator: generator,
        });
        sendJson(res, 200, { success: true, data: { document: saved.document } });
      } catch (error) {
        await updateRecord({
          mindmapStatus: hadMindmap ? 'ready' : 'error',
          mindmapError: error instanceof Error ? error.message : '思维导图生成失败',
        });
        sendJson(res, 500, {
          success: false,
          error: error instanceof Error ? error.message : '思维导图生成失败',
        });
      }
      return;
    }

    if (mindmapMatch && req.method === 'PUT') {
      const taskId = mindmapMatch[1];
      const body = await readJsonBody(req);
      const record = await getRecord(taskId);
      if (!record) {
        sendJson(res, 404, { success: false, error: '转录记录不存在' });
        return;
      }
      if (!record.savedPath) {
        sendJson(res, 400, { success: false, error: '当前转录缺少保存目录，无法保存思维导图' });
        return;
      }
      if (!body.document || typeof body.document !== 'object') {
        sendJson(res, 400, { success: false, error: '思维导图数据格式无效' });
        return;
      }

      const saved = await writeMindMapDocument(record.savedPath, body.document);
      const updateRecord = createRecordUpdateEmitter(taskId);
      await updateRecord({
        mindmapStatus: 'ready',
        mindmapUpdatedAt: new Date(),
        mindmapPath: saved.path,
        mindmapError: undefined,
      });
      sendJson(res, 200, { success: true, data: { document: saved.document } });
      return;
    }

    const contentPointsMatch = pathname.match(/^\/transcriptions\/([^/]+)\/content-points$/);
    if (contentPointsMatch && req.method === 'GET') {
      const taskId = contentPointsMatch[1];
      const record = await getRecord(taskId);
      if (!record) {
        sendJson(res, 404, { success: false, error: '转录记录不存在' });
        return;
      }
      if (!record.savedPath) {
        sendJson(res, 404, {
          success: false,
          error: '当前转录尚未生成观点结果',
          code: 'POINTS_NOT_FOUND',
        });
        return;
      }

      try {
        const result = await loadContentPoints(record.savedPath);
        sendJson(res, 200, { success: true, data: { result } });
      } catch (error) {
        sendJson(res, 404, {
          success: false,
          error: error instanceof Error ? error.message : '观点结果不存在',
          code: 'POINTS_NOT_FOUND',
        });
      }
      return;
    }

    const contentPointsGenerateMatch = pathname.match(/^\/transcriptions\/([^/]+)\/content-points\/generate$/);
    if (contentPointsGenerateMatch && req.method === 'POST') {
      const taskId = contentPointsGenerateMatch[1];
      const body = await readJsonBody(req);
      const record = await getRecord(taskId);
      if (!record) {
        sendJson(res, 404, { success: false, error: '转录记录不存在' });
        return;
      }
      if (record.status !== 'completed') {
        sendJson(res, 400, {
          success: false,
          error: '仅已完成的转录可提炼观点',
          code: 'TRANSCRIPT_NOT_COMPLETED',
        });
        return;
      }
      if (!record.savedPath) {
        sendJson(res, 400, { success: false, error: '当前转录缺少保存目录，无法提炼观点' });
        return;
      }
      if (!body.providerId) {
        sendJson(res, 400, {
          success: false,
          error: '未指定语言模型 Provider',
          code: 'PROVIDER_NOT_CONFIGURED',
        });
        return;
      }
      if (body.platform && body.platform !== 'redbook') {
        sendJson(res, 400, {
          success: false,
          error: '当前版本仅支持小红书观点提炼',
          code: 'UNSUPPORTED_PLATFORM',
        });
        return;
      }

      let hadPoints = false;
      try {
        await loadContentPoints(record.savedPath);
        hadPoints = true;
      } catch {}

      const updateRecord = createRecordUpdateEmitter(taskId);
      await updateRecord({
        pointExtractionStatus: 'generating',
        pointExtractionError: undefined,
      });

      try {
        const { result } = await extractContentPoints(
          record,
          body.providerId,
          body.modelId,
          body.platform,
        );
        const saved = await saveContentPoints(record.savedPath, result);
        await updateRecord({
          pointExtractionStatus: 'ready',
          pointExtractionUpdatedAt: new Date(saved.result.updatedAt),
          pointExtractionError: undefined,
        });
        sendJson(res, 200, { success: true, data: { result: saved.result } });
      } catch (error) {
        await updateRecord({
          pointExtractionStatus: hadPoints ? 'ready' : 'error',
          pointExtractionError: error instanceof Error ? error.message : '观点提炼失败',
        });
        sendJson(res, 500, {
          success: false,
          error: error instanceof Error ? error.message : '观点提炼失败',
          code: 'GENERATION_FAILED',
        });
      }
      return;
    }

    const contentMatch = pathname.match(/^\/transcriptions\/([^/]+)\/content$/);
    if (contentMatch && req.method === 'GET') {
      const taskId = contentMatch[1];
      const record = await getRecord(taskId);
      if (!record) {
        sendJson(res, 404, { success: false, error: '转录记录不存在' });
        return;
      }
      if (!record.savedPath) {
        sendJson(res, 404, {
          success: false,
          error: '当前转录尚未生成内容草稿',
          code: 'CONTENT_NOT_FOUND',
        });
        return;
      }

      try {
        const collection = await loadContentDrafts(record.savedPath);
        sendJson(res, 200, { success: true, data: { drafts: collection.drafts } });
      } catch (error) {
        sendJson(res, 404, {
          success: false,
          error: error instanceof Error ? error.message : '内容草稿不存在',
          code: 'CONTENT_NOT_FOUND',
        });
      }
      return;
    }

    const contentGenerateMatch = pathname.match(/^\/transcriptions\/([^/]+)\/content\/generate$/);
    if (contentGenerateMatch && req.method === 'POST') {
      const taskId = contentGenerateMatch[1];
      const body = await readJsonBody(req);
      const record = await getRecord(taskId);
      if (!record) {
        sendJson(res, 404, { success: false, error: '转录记录不存在' });
        return;
      }
      if (record.status !== 'completed') {
        sendJson(res, 400, {
          success: false,
          error: '仅已完成的转录可生成内容',
          code: 'TRANSCRIPT_NOT_COMPLETED',
        });
        return;
      }
      if (!record.savedPath) {
        sendJson(res, 400, { success: false, error: '当前转录缺少保存目录，无法生成内容' });
        return;
      }
      if (!body.providerId) {
        sendJson(res, 400, {
          success: false,
          error: '未指定语言模型 Provider',
          code: 'PROVIDER_NOT_CONFIGURED',
        });
        return;
      }
      if (!Array.isArray(body.selectedPointIds) || body.selectedPointIds.length === 0) {
        sendJson(res, 400, {
          success: false,
          error: '请至少选择一条观点',
          code: 'POINTS_NOT_SELECTED',
        });
        return;
      }
      if (body.platform !== 'redbook') {
        sendJson(res, 400, {
          success: false,
          error: 'Phase 1 仅支持小红书平台',
          code: 'UNSUPPORTED_PLATFORM',
        });
        return;
      }

      let pointResult;
      try {
        pointResult = await loadContentPoints(record.savedPath);
      } catch (error) {
        sendJson(res, 400, {
          success: false,
          error: '请先提炼观点后再生成内容',
          code: 'POINTS_NOT_FOUND',
        });
        return;
      }

      const selectedPointSet = new Set(body.selectedPointIds.map((item) => String(item)));
      const selectedPoints = pointResult.points.filter((point) => selectedPointSet.has(point.id));
      if (!selectedPoints.length) {
        sendJson(res, 400, {
          success: false,
          error: '未找到有效的已选观点',
          code: 'POINTS_NOT_SELECTED',
        });
        return;
      }

      let existingDraft = null;
      try {
        const collection = await loadContentDrafts(record.savedPath);
        existingDraft = collection.drafts?.redbook || null;
      } catch {}

      const updateRecord = createRecordUpdateEmitter(taskId);
      await updateRecord({
        contentGenerationStatus: 'generating',
        contentGenerationError: undefined,
      });

      try {
        const { draft } = await generatePlatformContent(
          record,
          selectedPoints,
          body.platform,
          body.providerId,
          body.modelId,
          existingDraft,
        );
        const saved = await saveContentDraft(record.savedPath, draft);
        await updateRecord({
          contentGenerationStatus: 'ready',
          contentGenerationUpdatedAt: new Date(saved.draft.updatedAt),
          contentGenerationError: undefined,
        });
        sendJson(res, 200, { success: true, data: { draft: saved.draft } });
      } catch (error) {
        await updateRecord({
          contentGenerationStatus: existingDraft ? 'ready' : 'error',
          contentGenerationError: error instanceof Error ? error.message : '内容生成失败',
        });
        sendJson(res, 500, {
          success: false,
          error: error instanceof Error ? error.message : '内容生成失败',
          code: 'GENERATION_FAILED',
        });
      }
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
    if (isExportError(error)) {
      const statusCode = error.code === EXPORT_ERROR_CODES.PLATFORM_NOT_CONFIGURED
        || error.code === EXPORT_ERROR_CODES.EXPORT_SOURCE_NOT_READY
        ? 400
        : error.code === EXPORT_ERROR_CODES.AUTH_FAILED
          ? 401
          : error.code === EXPORT_ERROR_CODES.CLI_NOT_FOUND
            ? 404
            : 500;

      sendJson(res, statusCode, {
        success: false,
        error: error.message,
        code: error.code,
      });
      return;
    }

    sendJson(res, error?.statusCode || 500, {
      success: false,
      error: error instanceof Error ? error.message : 'helper 请求失败',
    });
  }
}

module.exports = { handleRequest };
