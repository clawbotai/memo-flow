'use strict';

const fsp = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const {
  EXPORT_ERROR_CODES,
  ExportError,
  createExportResult,
} = require('../types');

const CONTENT_CHUNK_SIZE = 8000;

function ensureConfigured(config) {
  if (!config?.vaultPath) {
    throw new ExportError(
      EXPORT_ERROR_CODES.PLATFORM_NOT_CONFIGURED,
      'Obsidian 未配置 Vault 路径',
    );
  }
}

async function ensureVaultPath(vaultPath) {
  let stats;
  try {
    stats = await fsp.stat(vaultPath);
  } catch {
    throw new ExportError(
      EXPORT_ERROR_CODES.PLATFORM_NOT_CONFIGURED,
      'Obsidian Vault 路径不存在',
    );
  }

  if (!stats.isDirectory()) {
    throw new ExportError(
      EXPORT_ERROR_CODES.PLATFORM_NOT_CONFIGURED,
      'Obsidian Vault 路径不是文件夹',
    );
  }
}

function splitContent(content) {
  const chunks = [];
  const text = String(content || '');

  for (let index = 0; index < text.length; index += CONTENT_CHUNK_SIZE) {
    chunks.push(text.slice(index, index + CONTENT_CHUNK_SIZE));
  }

  return chunks.length > 0 ? chunks : [''];
}

function escapeCliArg(arg) {
  return String(arg || '').replace(/"/g, '\\"');
}

function normalizePathPart(input) {
  return String(input || '')
    .replace(/[\\]+/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .trim();
}

function buildNotePath(fileName, targetFolder) {
  const cleanFileName = normalizePathPart(fileName);
  const cleanTargetFolder = normalizePathPart(targetFolder);
  return cleanTargetFolder ? `${cleanTargetFolder}/${cleanFileName}` : cleanFileName;
}

async function runObsidianCli(config, args) {
  ensureConfigured(config);
  const command = config.cliPath || 'obsidian';
  const cwd = path.resolve(String(config.vaultPath));

  await ensureVaultPath(cwd);

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (error) => {
      if (error?.code === 'ENOENT') {
        reject(new ExportError(
          EXPORT_ERROR_CODES.CLI_NOT_FOUND,
          `未找到 Obsidian CLI：${command}`,
        ));
        return;
      }

      reject(new ExportError(
        EXPORT_ERROR_CODES.CLI_EXECUTION_FAILED,
        error instanceof Error ? error.message : 'Obsidian CLI 执行失败',
      ));
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        });
        return;
      }

      reject(new ExportError(
        EXPORT_ERROR_CODES.CLI_EXECUTION_FAILED,
        stderr.trim() || stdout.trim() || 'Obsidian CLI 执行失败',
        { exitCode: code },
      ));
    });
  });
}

const obsidianCliProvider = {
  id: 'obsidian',
  getMeta(config) {
    return {
      id: 'obsidian',
      name: 'Obsidian',
      description: '通过本机 Obsidian CLI 写入指定 Vault',
      configured: Boolean(config?.vaultPath),
      supports: ['export', 'test'],
    };
  },
  async test(config) {
    await runObsidianCli(config, ['files', 'total']);

    return {
      providerId: 'obsidian',
      success: true,
      message: 'Obsidian CLI 与 Vault 可用',
    };
  },
  async execute({ markdown, fileName, config }) {
    const notePath = buildNotePath(fileName, config.targetFolder);
    const chunks = splitContent(markdown);

    await runObsidianCli(config, [
      'create',
      `path="${escapeCliArg(notePath)}"`,
      `content="${escapeCliArg(chunks[0])}"`,
      'overwrite',
    ]);

    for (const chunk of chunks.slice(1)) {
      await runObsidianCli(config, [
        'append',
        `path="${escapeCliArg(notePath)}"`,
        `content="${escapeCliArg(chunk)}"`,
        'inline',
      ]);
    }

    return createExportResult('obsidian', {
      status: 'success',
      targetRef: notePath,
      message: '已写入 Obsidian Vault',
    });
  },
};

module.exports = {
  obsidianCliProvider,
};
