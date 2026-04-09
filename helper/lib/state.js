'use strict';

const { INSTALL_LOG_TAIL_LIMIT } = require('./constants');

/**
 * Singleton shared mutable state.
 * All modules require('./state') and get the same object reference.
 * Reassignment like `state.downloadProgress = {...}` works because
 * modules hold a reference to this object, not to individual fields.
 */
const state = {
  downloadProgress: {
    status: 'idle',
    downloaded: 0,
    total: 0,
    modelName: 'small',
  },
  localRuntimeInstallProgress: {
    status: 'idle',
    currentStep: undefined,
    message: '等待安装',
    progress: 0,
    logsTail: [],
  },
  modelDownloadClients: new Set(),
  localRuntimeInstallClients: new Set(),
  liveClients: new Map(),
  activeTasks: new Map(),
  historyMutationChain: Promise.resolve(),
  serverInstance: null,
  startPromise: null,
  localRuntimeInstallPromise: null,
  // INSTALL_LOG_TAIL_LIMIT exposed so exec.js can use it without re-requiring constants
  INSTALL_LOG_TAIL_LIMIT,
};

module.exports = state;
