'use strict';

const { spawn } = require('child_process');
const { HOMEBREW_INSTALL_COMMAND } = require('../constants');
const { normalizeLineBreaks, stripAnsi } = require('../text-utils');
const { writeSse } = require('../cors-sse');
const state = require('../state');
const { buildBaseEnv } = require('./path-utils');
const {
  detectHomebrewPath,
  resolveRuntimeExecutable,
  syncDetectedRuntimeIntoConfig,
} = require('./detection');

function emitLocalRuntimeInstallProgress() {
  for (const res of state.localRuntimeInstallClients) {
    if (!writeSse(res, state.localRuntimeInstallProgress)) {
      state.localRuntimeInstallClients.delete(res);
    }
  }
}

function updateLocalRuntimeInstallProgress(patch) {
  state.localRuntimeInstallProgress = {
    ...state.localRuntimeInstallProgress,
    ...patch,
  };
  emitLocalRuntimeInstallProgress();
}

function appendLocalRuntimeInstallLogs(text) {
  const lines = normalizeLineBreaks(String(text || ''))
    .split('\n')
    .map((line) => stripAnsi(line).trimEnd())
    .filter(Boolean);

  if (!lines.length) {
    return;
  }

  state.localRuntimeInstallProgress = {
    ...state.localRuntimeInstallProgress,
    logsTail: [...state.localRuntimeInstallProgress.logsTail, ...lines].slice(-state.INSTALL_LOG_TAIL_LIMIT),
  };
  emitLocalRuntimeInstallProgress();
}

function normalizeInstallComponents(components) {
  const allowed = new Set(['homebrew', 'whisper', 'ffmpeg']);
  const next = [];

  for (const component of Array.isArray(components) ? components : []) {
    if (!allowed.has(component) || next.includes(component)) {
      continue;
    }
    next.push(component);
  }

  return next;
}

async function runLoggedCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: buildBaseEnv(),
      ...options,
    });

    let stderr = '';
    let stdout = '';

    child.stdout?.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      appendLocalRuntimeInstallLogs(text);
    });

    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      appendLocalRuntimeInstallLogs(text);
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const details = stripAnsi(stderr || stdout).trim();
      reject(
        new Error(
          details ? `命令执行失败 (${code})\n${details}` : `命令执行失败，退出码 ${code}`,
        ),
      );
    });
  });
}

async function ensureHomebrewInstalled() {
  const existingPath = detectHomebrewPath();
  if (existingPath) {
    appendLocalRuntimeInstallLogs(`已检测到 Homebrew: ${existingPath}`);
    return existingPath;
  }

  updateLocalRuntimeInstallProgress({
    status: 'running',
    currentStep: 'installing_homebrew',
    message: '正在安装 Homebrew...',
    progress: 10,
  });

  await runLoggedCommand(
    '/bin/bash',
    ['-lc', HOMEBREW_INSTALL_COMMAND],
    {
      stdio: ['inherit', 'pipe', 'pipe'],
      env: {
        ...buildBaseEnv(),
      },
    },
  );

  const installedPath = detectHomebrewPath();
  if (!installedPath) {
    throw new Error('Homebrew 安装完成后仍未检测到 brew');
  }

  appendLocalRuntimeInstallLogs(`Homebrew 安装完成: ${installedPath}`);
  return installedPath;
}

async function ensureFormulaInstalled(component, homebrewPath) {
  const mapping = {
    whisper: {
      formula: 'whisper-cpp',
      step: 'installing_whisper',
      message: '正在安装 whisper.cpp...',
      progress: 55,
      validate: () => resolveRuntimeExecutable('whisper', '', detectHomebrewPath()),
    },
    ffmpeg: {
      formula: 'ffmpeg',
      step: 'installing_ffmpeg',
      message: '正在安装 ffmpeg...',
      progress: 85,
      validate: () => resolveRuntimeExecutable('ffmpeg', '', detectHomebrewPath()),
    },
  };

  const current = mapping[component];
  if (!current) {
    throw new Error(`不支持的安装组件: ${component}`);
  }

  const runtime = current.validate();
  if (runtime.installed) {
    appendLocalRuntimeInstallLogs(`${current.formula} 已可用，跳过安装`);
    return;
  }

  updateLocalRuntimeInstallProgress({
    status: 'running',
    currentStep: current.step,
    message: current.message,
    progress: current.progress,
  });

  await runLoggedCommand(homebrewPath, ['install', current.formula], {
    env: {
      ...buildBaseEnv(),
      HOMEBREW_NO_AUTO_UPDATE: '1',
      CI: '1',
    },
  });

  const nextRuntime = current.validate();
  if (!nextRuntime.installed) {
    throw new Error(`${current.formula} 安装完成后仍未检测到可执行文件`);
  }

  appendLocalRuntimeInstallLogs(`${current.formula} 安装完成`);
}

async function installLocalRuntime(requestedComponents) {
  if (process.platform !== 'darwin') {
    throw new Error('一键安装当前仅支持 macOS');
  }

  const requested = normalizeInstallComponents(requestedComponents);
  if (!requested.length) {
    throw new Error('未指定要安装的组件');
  }

  updateLocalRuntimeInstallProgress({
    status: 'running',
    currentStep: undefined,
    message: '准备检查本地环境...',
    progress: 0,
    logsTail: [],
  });

  const shouldInstallBinaries = requested.includes('whisper') || requested.includes('ffmpeg');
  let homebrewPath = detectHomebrewPath();

  if (requested.includes('homebrew') || (shouldInstallBinaries && !homebrewPath)) {
    homebrewPath = await ensureHomebrewInstalled();
  }

  if (!homebrewPath && shouldInstallBinaries) {
    throw new Error('未检测到 Homebrew，无法继续安装 whisper.cpp / ffmpeg');
  }

  if (requested.includes('whisper')) {
    await ensureFormulaInstalled('whisper', homebrewPath);
  }

  if (requested.includes('ffmpeg')) {
    await ensureFormulaInstalled('ffmpeg', homebrewPath);
  }

  const status = await syncDetectedRuntimeIntoConfig();
  updateLocalRuntimeInstallProgress({
    status: 'succeeded',
    currentStep: undefined,
    message: '本地依赖安装完成',
    progress: 100,
  });
  return status;
}

module.exports = {
  emitLocalRuntimeInstallProgress,
  updateLocalRuntimeInstallProgress,
  appendLocalRuntimeInstallLogs,
  normalizeInstallComponents,
  runLoggedCommand,
  ensureHomebrewInstalled,
  ensureFormulaInstalled,
  installLocalRuntime,
};
