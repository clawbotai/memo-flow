'use strict';

const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');

function isBareCommandPath(inputPath) {
  return (
    Boolean(inputPath) &&
    !path.isAbsolute(inputPath) &&
    !inputPath.includes('/') &&
    !inputPath.includes('\\') &&
    !inputPath.startsWith('.')
  );
}

function buildBaseEnv() {
  if (process.platform === 'win32') {
    return { ...process.env };
  }
  const extraPaths = ['/opt/homebrew/bin', '/opt/homebrew/sbin', '/usr/local/bin'];
  const fullPath = extraPaths.concat(String(process.env.PATH || '').split(':')).filter(Boolean);
  return {
    ...process.env,
    PATH: Array.from(new Set(fullPath)).join(':'),
  };
}

function resolveCommandPath(commandName) {
  try {
    const cmd =
      process.platform === 'win32'
        ? `where ${commandName}`
        : `command -v "${commandName.replaceAll('"', '\\"')}"`;
    const output = execSync(cmd, {
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: process.platform === 'win32' ? true : '/bin/bash',
      env: buildBaseEnv(),
    })
      .toString()
      .trim()
      .split(/\r?\n/)[0];
    return output || null;
  } catch {
    return null;
  }
}

function resolveConfigPath(inputPath) {
  if (!inputPath) return inputPath;
  if (path.isAbsolute(inputPath)) return path.normalize(inputPath);
  if (isBareCommandPath(inputPath)) {
    return resolveCommandPath(inputPath) || inputPath;
  }
  return path.resolve(process.cwd(), inputPath);
}

function buildExecOptions(binaryPath) {
  const env = buildBaseEnv();
  const resolvedPath = resolveConfigPath(binaryPath);

  if (process.platform === 'win32' || !resolvedPath || !path.isAbsolute(resolvedPath)) {
    return { env };
  }

  const buildDir = path.resolve(path.dirname(resolvedPath), '..');
  const dylibDirs = [
    path.join(buildDir, 'src'),
    path.join(buildDir, 'ggml', 'src'),
    path.join(buildDir, 'ggml', 'src', 'ggml-blas'),
    path.join(buildDir, 'ggml', 'src', 'ggml-metal'),
  ].filter((dir) => fs.existsSync(dir));

  if (dylibDirs.length) {
    const joined = dylibDirs.join(':');
    env.DYLD_LIBRARY_PATH = env.DYLD_LIBRARY_PATH
      ? `${joined}:${env.DYLD_LIBRARY_PATH}`
      : joined;
    env.DYLD_FALLBACK_LIBRARY_PATH = env.DYLD_FALLBACK_LIBRARY_PATH
      ? `${joined}:${env.DYLD_FALLBACK_LIBRARY_PATH}`
      : joined;
    env.LD_LIBRARY_PATH = env.LD_LIBRARY_PATH
      ? `${joined}:${env.LD_LIBRARY_PATH}`
      : joined;
  }

  return { env };
}

function resolveExecutablePath(inputPath) {
  if (!inputPath) return null;
  return resolveConfigPath(inputPath);
}

function hasExecutableFilePermissions(resolvedPath) {
  if (!resolvedPath || !fs.existsSync(resolvedPath)) return false;

  try {
    const stats = fs.statSync(resolvedPath);
    if (!stats.isFile()) return false;
    if (process.platform !== 'win32' && !(stats.mode & 0o111)) return false;
    return true;
  } catch {
    return false;
  }
}

function canRunExecutable(inputPath, args) {
  if (!inputPath) return false;

  const resolvedPath = resolveExecutablePath(inputPath);
  if (!resolvedPath) return false;

  try {
    if (isBareCommandPath(inputPath)) {
      execFileSync(resolvedPath, args, {
        timeout: 10000,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: buildBaseEnv(),
      });
      return true;
    }

    if (!hasExecutableFilePermissions(resolvedPath)) {
      return false;
    }

    execFileSync(resolvedPath, args, {
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...buildExecOptions(inputPath),
    });
    return true;
  } catch {
    return false;
  }
}

function isValidHomebrewExecutable(inputPath) {
  return canRunExecutable(inputPath, ['--version']);
}

function findWorkingExecutable(candidates, args) {
  const seen = new Set();

  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = String(candidate).trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);

    if (!canRunExecutable(normalized, args)) {
      continue;
    }

    return resolveExecutablePath(normalized) || normalized;
  }

  return null;
}

module.exports = {
  isBareCommandPath,
  buildBaseEnv,
  resolveCommandPath,
  resolveConfigPath,
  buildExecOptions,
  resolveExecutablePath,
  hasExecutableFilePermissions,
  canRunExecutable,
  isValidHomebrewExecutable,
  findWorkingExecutable,
};
