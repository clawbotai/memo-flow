// Whisper 配置管理
// 读取和保存 whisper.cpp 的配置

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { WhisperConfig } from '@/types';

// 配置文件路径
const CONFIG_FILE_PATH = path.join(process.cwd(), '.whisper-config.json');
const PROJECT_ROOT = process.cwd();
const PROJECT_NAME = path.basename(PROJECT_ROOT);

function startsWithProjectName(inputPath: string): boolean {
  return inputPath === PROJECT_NAME
    || inputPath.startsWith(`${PROJECT_NAME}/`)
    || inputPath.startsWith(`${PROJECT_NAME}\\`);
}

function isBareCommandPath(inputPath: string): boolean {
  return Boolean(inputPath)
    && !path.isAbsolute(inputPath)
    && !inputPath.includes('/')
    && !inputPath.includes('\\')
    && !inputPath.startsWith('.');
}

function resolveCommandPath(commandName: string): string | null {
  try {
    const extendedPath = [process.env.PATH, '/usr/local/bin', '/opt/homebrew/bin', '/opt/homebrew/sbin']
      .filter(Boolean)
      .join(':');

    const resolvedPath = execSync(`command -v "${commandName}"`, {
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: '/bin/bash',
      env: {
        ...process.env,
        PATH: extendedPath,
      },
    }).toString().trim();

    return resolvedPath || null;
  } catch {
    return null;
  }
}

export function resolveConfigPath(inputPath: string): string {
  if (!inputPath) return inputPath;
  if (path.isAbsolute(inputPath)) return inputPath;
  if (isBareCommandPath(inputPath)) {
    return resolveCommandPath(inputPath) ?? inputPath;
  }

  // 1. 如果路径是以 PROJECT_NAME 开头的（向后兼容）
  if (startsWithProjectName(inputPath)) {
    // 移除 PROJECT_NAME 前缀
    const relativePath = inputPath.substring(PROJECT_NAME.length).replace(/^[/\\]+/, '');
    // 重新拼接到 PROJECT_ROOT
    return path.resolve(PROJECT_ROOT, relativePath);
  }

  // 2. 否则，假定它是相对于 PROJECT_ROOT 的
  return path.resolve(PROJECT_ROOT, inputPath);
}

export function toProjectDisplayPath(inputPath: string): string {
  if (!inputPath) return inputPath;

  const resolvedPath = path.isAbsolute(inputPath) ? inputPath : path.resolve(PROJECT_ROOT, inputPath);
  const relativeToProjectRoot = path.relative(PROJECT_ROOT, resolvedPath);

  // 如果路径在项目根目录下
  if (
    relativeToProjectRoot
    && relativeToProjectRoot !== '.'
    && !relativeToProjectRoot.startsWith('..')
    && !path.isAbsolute(relativeToProjectRoot)
  ) {
    // 不再强制添加 PROJECT_NAME 前缀，直接使用相对路径
    return relativeToProjectRoot;
  }

  return inputPath;
}

function hasUsableWhisperExecutable(whisperPath: string): boolean {
  if (!whisperPath) return false;
  const resolvedPath = resolveConfigPath(whisperPath);

  if (isBareCommandPath(whisperPath)) {
    return resolvedPath !== whisperPath;
  }

  try {
    return fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile();
  } catch {
    return false;
  }
}

export function isValidFfmpegExecutable(ffmpegPath: string): boolean {
  try {
    if (!ffmpegPath || typeof ffmpegPath !== 'string') {
      return false;
    }

    const resolvedPath = resolveConfigPath(ffmpegPath);

    // 如果是裸命令，尝试解析
    if (isBareCommandPath(ffmpegPath)) {
      return resolveCommandPath(ffmpegPath) !== null;
    }

    if (!fs.existsSync(resolvedPath)) {
      return false;
    }

    const stats = fs.statSync(resolvedPath);
    return stats.isFile() && (!!(stats.mode & 0o111));
  } catch {
    return false;
  }
}

export function isValidWhisperExecutable(whisperPath: string): boolean {
  try {
    if (!whisperPath || typeof whisperPath !== 'string') {
      console.log(`无效的路径参数: ${whisperPath}`);
      return false;
    }

    if (!fs.existsSync(whisperPath)) {
      console.log(`文件不存在: ${whisperPath}`);

      const basename = path.basename(whisperPath);
      if ((basename === 'whisper' || basename === 'main' || basename === 'whisper-cli') && 
          !whisperPath.includes('whisper.cpp') && 
          !whisperPath.includes('build')) {
        console.warn(`⚠️ 检测到不完整的路径 "${whisperPath}"，预期的二进制文件通常在 "whisper.cpp/build/bin/" 目录下`);
      }

      return false;
    }

    // 检查文件是否可执行
    const stats = fs.statSync(whisperPath);
    if (!stats.isFile()) {
      console.log(`不是文件: ${whisperPath}`);
      return false;
    }

    // 确保文件具有可执行权限
    if (!(stats.mode & 0o111)) {
      console.log(`文件不可执行: ${whisperPath}`);
      try {
        // 尝试设置执行权限
        fs.chmodSync(whisperPath, 0o755);
        console.log(`已设置执行权限: ${whisperPath}`);
      } catch (chmodErr) {
        console.error(`设置执行权限失败:`, chmodErr);
        return false;
      }
    }

    console.log(`正在验证可执行文件: ${whisperPath}, 文件大小: ${stats.size} bytes (${Math.round(stats.size / 1024)} KB)`);

    // 首先进行基本的功能测试
    try {
      const extendedPath = [process.env.PATH, '/usr/local/bin', '/opt/homebrew/bin', '/opt/homebrew/sbin']
        .filter(Boolean)
        .join(':');

      execSync(`"${whisperPath}" -h`, {
        timeout: 25000, // 25秒超时，提供更多时间加载依赖
        stdio: ['ignore', 'pipe', 'pipe'], // 捕获输出和错误
        env: {
          ...process.env,
          PATH: extendedPath
        }
      });

      console.log(`命令执行成功，退出码: 0`);
      return true;
    } catch {
      // 功能测试失败，但我们再做一次更宽松的检查
      console.warn(`功能测试失败，进行备用验证...`);

      // 检查文件头部来确认是有效的可执行文件格式
      let fd: number | undefined;
      try {
        fd = fs.openSync(whisperPath, 'r');
        const buffer = Buffer.alloc(16);
        fs.readSync(fd, buffer, 0, 16, 0);
        fs.closeSync(fd);
        fd = undefined; // 标记已关闭

        let isValidFormat = false;

        // 检查各种可执行文件格式
        if (process.platform === 'darwin') {
          // Mach-O formats (little-endian storage)
          const magic = buffer.readUInt32LE(0);
          isValidFormat = magic === 0xFEEDFACF || // MH_MAGIC_64 (64-bit)
                         magic === 0xFEEDFACE;     // MH_MAGIC (32-bit)
          // FAT binary uses big-endian: 0xCAFEBABE
          if (!isValidFormat) {
            const magicBE = buffer.readUInt32BE(0);
            isValidFormat = magicBE === 0xCAFEBABE; // FAT_MAGIC
          }
        } else if (process.platform === 'linux') {
          // ELF format
          isValidFormat = buffer[0] === 0x7F && buffer[1] === 0x45 && buffer[2] === 0x4C && buffer[3] === 0x46;
        } else {
          // 通用检查
          const magicLE = buffer.readUInt32LE(0);
          isValidFormat = (buffer[0] === 0x7F && buffer[1] === 0x45 && buffer[2] === 0x4C && buffer[3] === 0x46) || // ELF
                         (buffer[0] === 0x4D && buffer[1] === 0x5A) || // PE ("MZ")
                         magicLE === 0xFEEDFACF || magicLE === 0xFEEDFACE; // Mach-O
        }

        if (isValidFormat) {
          console.log('虽然功能测试失败，但检测到有效的可执行文件格式，假定为有效');
          return true;
        } else {
          console.log('文件格式也不是有效的可执行格式');
          return false;
        }
      } catch (formatError) {
        // 确保文件描述符被关闭
        if (fd !== undefined) {
          try { fs.closeSync(fd); } catch { /* ignore */ }
        }
        console.error('格式检查失败:', formatError);
        return false;
      }
    }
  } catch (error) {
    console.error('验证 whisper 可执行文件失败:', error);
    if (error instanceof Error) {
      console.error('错误详情:', error.message);
    }
    return false;
  }
}

function getDefaultOutputDir(): string {
  return 'transcripts';
}

function getDefaultModelPath(modelName: string = 'small'): string {
  return path.join('models', `ggml-${modelName}.bin`);
}

function getWhisperBinaryCandidates(): string[] {
  const isWindows = process.platform === 'win32';
  const binaryName = isWindows ? 'whisper-cli.exe' : 'whisper-cli';
  const candidates = [
    path.join('whisper.cpp', 'build', 'bin', binaryName),
    path.join('whisper.cpp', 'build', 'bin', 'main'),
    path.join('whisper.cpp', 'main'),
    path.join('whisper.cpp', 'whisper-cli'),
  ];

  if (isWindows) {
    candidates.unshift(
      path.join('whisper.cpp', 'build', 'bin', 'Release', binaryName)
    );
  }

  return candidates;
}

function getDefaultWhisperPath(): string {
  const candidates = getWhisperBinaryCandidates();

  for (const candidate of candidates) {
    const resolvedPath = resolveConfigPath(candidate);
    if (fs.existsSync(resolvedPath)) {
      const stats = fs.statSync(resolvedPath);
      if (stats.isFile() && stats.size > 1000) {
        return candidate;
      }
    }
  }

  console.warn(`⚠️ 未找到有效的 whisper 可执行文件，使用默认路径: ${candidates[0]}`);
  return candidates[0];
}

function getDefaultConfig(): WhisperConfig {
  return {
    whisperPath: getDefaultWhisperPath(),
    modelPath: getDefaultModelPath('small'),
    modelName: 'small',
    threads: 4,
    outputDir: getDefaultOutputDir(),
    ffmpegPath: 'ffmpeg',
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
  const envWhisperPath = process.env.WHISPER_PATH;
  const envModelPath = process.env.WHISPER_MODEL_PATH;
  const envOutputDir = process.env.OUTPUT_DIR;
  const envFfmpegPath = process.env.FFMPEG_PATH;

  const whisperPath = envWhisperPath
    ? (hasUsableWhisperExecutable(envWhisperPath) ? envWhisperPath : config.whisperPath)
    : config.whisperPath;
  const modelPath = envModelPath
    ? (fs.existsSync(resolveConfigPath(envModelPath)) ? envModelPath : config.modelPath)
    : config.modelPath;
  const outputDir = envOutputDir || config.outputDir;
  const ffmpegPath = envFfmpegPath || config.ffmpegPath;

  return {
    whisperPath,
    modelPath,
    modelName: config.modelName,
    threads: process.env.WHISPER_THREADS
      ? parseInt(process.env.WHISPER_THREADS, 10)
      : config.threads,
    outputDir,
    ffmpegPath,
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

      // 验证 whisperPath 是否有效
      if (mergedConfig.whisperPath) {
        const hasKeyword = mergedConfig.whisperPath.includes('whisper-cli')
          || mergedConfig.whisperPath.includes('main')
          || mergedConfig.whisperPath.includes('whisper');
        const isUsable = hasUsableWhisperExecutable(mergedConfig.whisperPath);

        if (!hasKeyword || !isUsable) {
          console.warn(`⚠️ 配置文件中的 whisperPath 无效或不存在: "${mergedConfig.whisperPath}"，将尝试使用默认路径`);
          mergedConfig.whisperPath = defaultConfig.whisperPath;
        }
      }

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
    ffmpegPath: resolveConfigPath(config.ffmpegPath),
  };
}
