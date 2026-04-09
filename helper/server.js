'use strict';

/**
 * MemoFlow Helper — entry point (slim).
 *
 * All business logic lives in helper/lib/:
 *   constants  → compile-time constants
 *   state      → shared mutable singleton
 *   app-paths  → derived filesystem paths + ensureAppDirs
 *   text-utils → normalizeLineBreaks / stripAnsi
 *   cors-sse   → CORS, SSE, sendJson utilities
 *   config     → Whisper config + language-model config I/O
 *   history    → transcription history CRUD + SSE push
 *   exec       → executable detection + local runtime install
 *   transcription → transcription orchestration (Whisper + Qwen ASR + LLM)
 *   http-handler  → HTTP routing + model download
 */

const http = require('http');
const { HOST, PORT } = require('./lib/constants');
const { APP_DIR, ensureAppDirs } = require('./lib/app-paths');
const { sendJson } = require('./lib/cors-sse');
const { loadConfig } = require('./lib/config');
const { reconcileInterruptedRecords, importMissingTranscriptHistory } = require('./lib/history');
const { syncDetectedRuntimeIntoConfig } = require('./lib/exec');
const { handleRequest } = require('./lib/http-handler');
const state = require('./lib/state');

async function start() {
  if (state.serverInstance) {
    return state.serverInstance;
  }
  if (state.startPromise) {
    return state.startPromise;
  }

  await ensureAppDirs();
  const config = await loadConfig();
  await syncDetectedRuntimeIntoConfig();
  await reconcileInterruptedRecords();
  const importedCount = await importMissingTranscriptHistory(config);

  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      sendJson(res, 500, {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      });
    });
  });

  state.startPromise = new Promise((resolve, reject) => {
    const cleanup = () => {
      server.off('error', handleError);
      server.off('listening', handleListening);
    };

    const handleError = (error) => {
      cleanup();
      state.startPromise = null;
      reject(error);
    };

    const handleListening = () => {
      cleanup();
      state.serverInstance = server;
      state.startPromise = null;
      console.log(`[MemoFlow Helper] listening on http://${HOST}:${PORT}`);
      console.log(`[MemoFlow Helper] app data dir: ${APP_DIR}`);
      if (importedCount > 0) {
        console.log(`[MemoFlow Helper] imported ${importedCount} transcript record(s) from ${config.outputDir}`);
      }
      resolve(server);
    };

    server.once('error', handleError);
    server.once('listening', handleListening);
    server.listen(PORT, HOST);
  });

  return state.startPromise;
}

async function stop() {
  if (state.startPromise) {
    await state.startPromise;
  }

  if (!state.serverInstance) {
    return;
  }

  await new Promise((resolve, reject) => {
    state.serverInstance.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  state.serverInstance = null;
}

if (require.main === module) {
  start().catch((error) => {
    console.error('[MemoFlow Helper] failed to start:', error);
    process.exit(1);
  });
} else {
  module.exports = { start, stop };
}
