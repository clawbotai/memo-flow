// Whisper 配置管理
// 读取和保存 whisper.cpp 的配置

import fs from 'fs';
import path from 'path';
import os from 'os';
import { WhisperConfig } from '@/types';

// 配置文件路径
const CONFIG_FILE_PATH = path.join(process.cwd(), '.whisper-config.json');

// 默认配置
const DEFAULT_CONFIG: WhisperConfig = {
  whisperPath: path.join(process.cwd(), 'whisper.cpp/build/bin/whisper-cli'),
  modelPath: path.join(process.cwd(), 'models/ggml-small.bin'),
  modelName: 'small',
  threads: 4,
  outputDir: path.join(os.homedir(), 'Documents', 'memo-flow-transcripts'),
};

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
  try {
    if (fs.existsSync(CONFIG_FILE_PATH)) {
      const fileContent = fs.readFileSync(CONFIG_FILE_PATH, 'utf8');
      const savedConfig = JSON.parse(fileContent) as Partial<WhisperConfig>;
      const mergedConfig = {
        ...DEFAULT_CONFIG,
        ...savedConfig,
      };
      return mergeWithEnv(mergedConfig);
    }
  } catch (error) {
    console.error('读取 whisper 配置失败:', error);
  }

  // 配置文件不存在或读取失败，返回默认值（合并环境变量）
  return mergeWithEnv({ ...DEFAULT_CONFIG });
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
