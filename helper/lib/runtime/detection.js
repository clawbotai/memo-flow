'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { loadConfig, saveConfig, isDefaultBinaryConfigPath } = require('../config');
const { buildBaseEnv, canRunExecutable, findWorkingExecutable, resolveExecutablePath, resolveConfigPath } = require('./path-utils');

function detectHomebrewPath() {
  if (process.platform !== 'darwin') {
    return null;
  }

  return findWorkingExecutable(
    ['/opt/homebrew/bin/brew', '/usr/local/bin/brew', 'brew'],
    ['--version'],
  );
}

function getBrewFormulaExecutableCandidates(homebrewPath, formulaName, executableNames) {
  if (!homebrewPath) {
    return [];
  }

  try {
    const prefix = execFileSync(homebrewPath, ['--prefix', formulaName], {
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: buildBaseEnv(),
    })
      .toString()
      .trim();

    if (!prefix) {
      return [];
    }

    return executableNames.map((name) => path.join(prefix, 'bin', name));
  } catch {
    return [];
  }
}

function getDetectedWhisperCandidates(homebrewPath) {
  return [
    'whisper-cli',
    '/opt/homebrew/bin/whisper-cli',
    '/usr/local/bin/whisper-cli',
    'whisper-cpp',
    '/opt/homebrew/bin/whisper-cpp',
    '/usr/local/bin/whisper-cpp',
    ...getBrewFormulaExecutableCandidates(homebrewPath, 'whisper-cpp', [
      'whisper-cli',
      'whisper-cpp',
      'main',
    ]),
  ];
}

function getDetectedFfmpegCandidates(homebrewPath) {
  return [
    'ffmpeg',
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    ...getBrewFormulaExecutableCandidates(homebrewPath, 'ffmpeg', ['ffmpeg']),
  ];
}

function resolveRuntimeExecutable(kind, configuredPath, homebrewPath, isManagedPath = false) {
  const args = kind === 'whisper' ? ['-h'] : ['-version'];
  const configuredPathRaw = String(configuredPath || '').trim();
  const configuredIsUserDefined =
    Boolean(configuredPathRaw) &&
    !isDefaultBinaryConfigPath(kind, configuredPathRaw) &&
    !isManagedPath;

  if (configuredIsUserDefined && canRunExecutable(configuredPathRaw, args)) {
    return {
      configuredPath: configuredPathRaw,
      effectivePath: resolveExecutablePath(configuredPathRaw) || configuredPathRaw,
      source: 'configured',
      installed: true,
    };
  }

  const detectedCandidates =
    kind === 'whisper'
      ? getDetectedWhisperCandidates(homebrewPath)
      : getDetectedFfmpegCandidates(homebrewPath);
  const detectedPath = findWorkingExecutable(detectedCandidates, args);

  if (detectedPath) {
    return {
      configuredPath: configuredPathRaw,
      effectivePath: detectedPath,
      source: 'detected',
      installed: true,
    };
  }

  return {
    configuredPath: configuredPathRaw,
    effectivePath: undefined,
    source: 'missing',
    installed: false,
  };
}

function isValidWhisperExecutable(inputPath) {
  return canRunExecutable(inputPath, ['-h']);
}

function isValidFfmpegExecutable(inputPath) {
  return canRunExecutable(inputPath, ['-version']);
}

function inferModelName(modelPath) {
  const { getDefaultModelName } = require('../config');
  if (!modelPath) return getDefaultModelName();
  const normalized = modelPath.toLowerCase();
  if (normalized.includes('medium')) return 'medium';
  return 'small';
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function buildWhisperStatus(config) {
  const resolvedModelPath = resolveConfigPath(config.modelPath);
  const modelInstalled = Boolean(resolvedModelPath && fs.existsSync(resolvedModelPath));
  const homebrewPath = detectHomebrewPath();
  const homebrewInstalled = Boolean(homebrewPath);
  const whisperRuntime = resolveRuntimeExecutable(
    'whisper',
    config.whisperPath,
    homebrewPath,
    Boolean(config.whisperPathManaged),
  );
  const ffmpegRuntime = resolveRuntimeExecutable(
    'ffmpeg',
    config.ffmpegPath,
    homebrewPath,
    Boolean(config.ffmpegPathManaged),
  );
  let modelSize = '0 B';
  if (modelInstalled) {
    modelSize = formatFileSize(fs.statSync(resolvedModelPath).size);
  }

  const missingRequirements = [];
  if (!whisperRuntime.installed) {
    if (!homebrewInstalled && process.platform === 'darwin') {
      missingRequirements.push('homebrew');
    }
    missingRequirements.push('whisper');
  }
  if (!ffmpegRuntime.installed) {
    if (!homebrewInstalled && process.platform === 'darwin') {
      missingRequirements.push('homebrew');
    }
    missingRequirements.push('ffmpeg');
  }
  if (!modelInstalled) {
    missingRequirements.push('model');
  }

  return {
    helperConnected: true,
    homebrewInstalled,
    whisperInstalled: whisperRuntime.installed,
    modelInstalled,
    ffmpegInstalled: ffmpegRuntime.installed,
    autoInstallSupported: process.platform === 'darwin',
    homebrewPath: homebrewPath || '',
    configuredWhisperPath: config.whisperPath || '',
    configuredFfmpegPath: config.ffmpegPath || '',
    effectiveWhisperPath: whisperRuntime.effectivePath || '',
    effectiveFfmpegPath: ffmpegRuntime.effectivePath || '',
    whisperSource: whisperRuntime.source,
    ffmpegSource: ffmpegRuntime.source,
    missingRequirements: Array.from(new Set(missingRequirements)),
    whisperPath: config.whisperPath,
    modelPath: config.modelPath,
    modelName: config.modelName || inferModelName(config.modelPath),
    modelSize,
    ffmpegPath: config.ffmpegPath,
    platform: process.platform,
    installMode: 'mixed',
  };
}

async function syncDetectedRuntimeIntoConfig() {
  const config = await loadConfig();
  const status = buildWhisperStatus(config);
  let changed = false;

  if (
    (!String(config.whisperPath || '').trim() || !isValidWhisperExecutable(config.whisperPath)) &&
    status.effectiveWhisperPath
  ) {
    config.whisperPath = status.effectiveWhisperPath;
    config.whisperPathManaged = true;
    changed = true;
  }

  if (
    (!String(config.ffmpegPath || '').trim() || !isValidFfmpegExecutable(config.ffmpegPath)) &&
    status.effectiveFfmpegPath
  ) {
    config.ffmpegPath = status.effectiveFfmpegPath;
    config.ffmpegPathManaged = true;
    changed = true;
  }

  if (changed) {
    await saveConfig(config);
  }

  return buildWhisperStatus(await loadConfig());
}

module.exports = {
  detectHomebrewPath,
  getBrewFormulaExecutableCandidates,
  getDetectedWhisperCandidates,
  getDetectedFfmpegCandidates,
  resolveRuntimeExecutable,
  isValidWhisperExecutable,
  isValidFfmpegExecutable,
  inferModelName,
  formatFileSize,
  buildWhisperStatus,
  syncDetectedRuntimeIntoConfig,
};
