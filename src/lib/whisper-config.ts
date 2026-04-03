// Whisper 配置管理
// 读取和保存 whisper.cpp 的配置

import fs from 'fs';
import path from 'path';
import { WhisperConfig } from '@/types';

// 配置文件路径
const CONFIG_FILE_PATH = path.join(process.cwd(), '.whisper-config.json');
const PROJECT_ROOT = process.cwd();
const PROJECT_NAME = path.basename(PROJECT_ROOT);
const PROJECT_PARENT = path.dirname(PROJECT_ROOT);

function startsWithProjectName(inputPath: string): boolean {
  return inputPath === PROJECT_NAME
    || inputPath.startsWith(`${PROJECT_NAME}/`)
    || inputPath.startsWith(`${PROJECT_NAME}\\`);
}

export function resolveConfigPath(inputPath: string): string {
  if (!inputPath) return inputPath;
  if (path.isAbsolute(inputPath)) return inputPath;

  return startsWithProjectName(inputPath)
    ? path.resolve(PROJECT_PARENT, inputPath)
    : path.resolve(PROJECT_ROOT, inputPath);
}

export function toProjectDisplayPath(inputPath: string): string {
  if (!inputPath) return inputPath;

  const resolvedPath = path.isAbsolute(inputPath) ? inputPath : path.resolve(PROJECT_ROOT, inputPath);
  const relativeToProjectRoot = path.relative(PROJECT_ROOT, resolvedPath);

  if (
    relativeToProjectRoot
    && relativeToProjectRoot !== '.'
    && !relativeToProjectRoot.startsWith('..')
    && !path.isAbsolute(relativeToProjectRoot)
  ) {
    return path.join(PROJECT_NAME, relativeToProjectRoot);
  }

  return inputPath;
}

function getDefaultOutputDir(): string {
  return path.join(PROJECT_NAME, 'transcripts');
}

function getDefaultModelPath(modelName: string = 'small'): string {
  return path.join(PROJECT_NAME, 'models', `ggml-${modelName}.bin`);
}

function getWhisperBinaryCandidates(): string[] {
  const isWindows = process.platform === 'win32';
  const binaryName = isWindows ? 'whisper-cli.exe' : 'whisper-cli';
  const candidates = [
    path.join(PROJECT_NAME, 'whisper.cpp', 'build', 'bin', binaryName),
  ];

  if (isWindows) {
    candidates.unshift(
      path.join(PROJECT_NAME, 'whisper.cpp', 'build', 'bin', 'Release', binaryName)
    );
  }

  return candidates;
}

function getDefaultWhisperPath(): string {
  const candidates = getWhisperBinaryCandidates();
  return candidates.find((candidate) => fs.existsSync(resolveConfigPath(candidate))) ?? candidates[0];
}

function getDefaultConfig(): WhisperConfig {
  return {
    whisperPath: getDefaultWhisperPath(),
    modelPath: getDefaultModelPath('small'),
    modelName: 'small',
    threads: 4,
    outputDir: getDefaultOutputDir(),
  };
}

/**
 * 格式化文件大小为可读字符串
 * @param bytes 字节数
 * @returns 格式化后的字符串，如 "462 MB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 从环境变量获取配置覆盖
 * @param config 基础配置
 * @returns 合并环境变量后的配置
 */
function mergeWithEnv(config: WhisperConfig): WhisperConfig {
  return {
    whisperPath: process.env.WHISPER_PATH || config.whisperPath,
    modelPath: process.env.WHISPER_MODEL_PATH || config.modelPath,
    modelName: config.modelName,
    threads: process.env.WHISPER_THREADS
      ? parseInt(process.env.WHISPER_THREADS, 10)
      : config.threads,
    outputDir: process.env.OUTPUT_DIR || config.outputDir,
  };
}

/**
 * 读取 Whisper 配置
 * 如果配置文件不存在，返回默认值
 * 环境变量优先级最高
 * @returns WhisperConfig 配置对象
 */
export function getWhisperConfig(): WhisperConfig {
  const defaultConfig = getDefaultConfig();

  try {
    if (fs.existsSync(CONFIG_FILE_PATH)) {
      const fileContent = fs.readFileSync(CONFIG_FILE_PATH, 'utf8');
      const savedConfig = JSON.parse(fileContent) as Partial<WhisperConfig>;
      const mergedConfig = {
        ...defaultConfig,
        ...savedConfig,
      };
      return mergeWithEnv(mergedConfig);
    }
  } catch (error) {
    console.error('读取 whisper 配置失败:', error);
  }

  // 配置文件不存在或读取失败，返回默认值（合并环境变量）
  return mergeWithEnv(defaultConfig);
}

/**
 * 保存 Whisper 配置到文件
 * @param config 要保存的配置
 * @returns 保存后的配置（包含环境变量覆盖）
 */
export function saveWhisperConfig(config: WhisperConfig): WhisperConfig {
  try {
    // 保存到配置文件（不包含环境变量）
    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(config, null, 2), 'utf8');
  } catch (error) {
    console.error('保存 whisper 配置失败:', error);
    throw new Error('保存配置失败');
  }

  // 返回合并环境变量后的配置
  return mergeWithEnv(config);
}

/**
 * 从模型路径推断模型名称
 * @param modelPath 模型文件路径
 * @returns 模型名称，如 'small' 或 'medium'
 */
export function inferModelName(modelPath: string): string {
  const fileName = path.basename(modelPath).toLowerCase();
  if (fileName.includes('small')) return 'small';
  if (fileName.includes('medium')) return 'medium';
  if (fileName.includes('large')) return 'large';
  if (fileName.includes('tiny')) return 'tiny';
  if (fileName.includes('base')) return 'base';
  return 'unknown';
}

export function resolveWhisperConfigPaths(config: WhisperConfig): WhisperConfig {
  return {
    ...config,
    whisperPath: resolveConfigPath(config.whisperPath),
    modelPath: resolveConfigPath(config.modelPath),
    outputDir: resolveConfigPath(config.outputDir),
  };
}
