'use strict';

const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { APP_NAME } = require('./constants');

function getAppDataDir() {
  if (process.env.MEMOFLOW_HELPER_DATA_DIR) {
    return path.resolve(process.env.MEMOFLOW_HELPER_DATA_DIR);
  }
  const home = os.homedir();
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', APP_NAME);
  }
  if (process.platform === 'win32') {
    return path.join(
      process.env.APPDATA || path.join(home, 'AppData', 'Roaming'),
      APP_NAME,
    );
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), APP_NAME);
}

const APP_DIR = getAppDataDir();
const MODELS_DIR = path.join(APP_DIR, 'models');
const HISTORY_FILE = path.join(APP_DIR, 'transcription-history.json');
const CONFIG_FILE = path.join(APP_DIR, 'whisper-config.json');
const LANGUAGE_MODEL_CONFIG_FILE = path.join(APP_DIR, 'language-model-config.json');
const TEMP_DIR = path.join(os.tmpdir(), 'memo-flow-helper');

async function ensureAppDirs() {
  await fsp.mkdir(APP_DIR, { recursive: true });
  await fsp.mkdir(MODELS_DIR, { recursive: true });
  await fsp.mkdir(TEMP_DIR, { recursive: true });
}

module.exports = {
  APP_DIR,
  MODELS_DIR,
  HISTORY_FILE,
  CONFIG_FILE,
  LANGUAGE_MODEL_CONFIG_FILE,
  TEMP_DIR,
  ensureAppDirs,
};
