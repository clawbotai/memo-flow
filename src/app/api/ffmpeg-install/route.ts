import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { getWhisperConfig, saveWhisperConfig, resolveWhisperConfigPaths, isValidFfmpegExecutable, resolveConfigPath, toProjectDisplayPath } from '@/lib/whisper-config';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

const PROJECT_ROOT = process.cwd();
const PROGRESS_FILE = path.join(PROJECT_ROOT, '.ffmpeg-install-progress.json');
const HOMEBREW_FFMPEG_LOCK_FILES = [
  '/usr/local/var/homebrew/locks/ffmpeg.formula.lock',
  '/opt/homebrew/var/homebrew/locks/ffmpeg.formula.lock',
];

interface InstallProgress {
  status: 'installing' | 'completed' | 'error' | 'idle';
  step: string;
  error?: string;
}

function writeProgress(progress: InstallProgress): void {
  try {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), 'utf8');
  } catch (e) {
    console.error('写入 ffmpeg 安装进度失败:', e);
  }
}

function extendPathEnv(): string {
  const shellPath = process.env.PATH || '';
  const extraPaths = ['/opt/homebrew/bin', '/opt/homebrew/sbin', '/usr/local/bin'];
  const fullPath = extraPaths.concat(shellPath.split(':')).filter(Boolean);
  const uniquePath = Array.from(new Set(fullPath)).join(':');
  return uniquePath;
}

function resolveUsableFfmpegPath(configFfmpegPath: string): string | null {
  if (isValidFfmpegExecutable(configFfmpegPath)) {
    return resolveConfigPath(configFfmpegPath);
  }
  if (isValidFfmpegExecutable('ffmpeg')) {
    return resolveConfigPath('ffmpeg');
  }
  return null;
}

function persistUsableFfmpegPath(configFfmpegPath: string, usableFfmpegPath: string): string {
  const config = getWhisperConfig();
  const displayPath = toProjectDisplayPath(usableFfmpegPath);

  if (resolveConfigPath(configFfmpegPath) !== usableFfmpegPath || config.ffmpegPath !== displayPath) {
    saveWhisperConfig({
      ...config,
      ffmpegPath: displayPath,
    });
  }

  return displayPath;
}

async function canRunFfmpeg(env: NodeJS.ProcessEnv, ffmpegPath: string): Promise<boolean> {
  if (!ffmpegPath) return false;
  const escapedPath = ffmpegPath.replaceAll('"', '\\"');
  const command = ffmpegPath === 'ffmpeg' ? 'ffmpeg -version' : `"${escapedPath}" -version`;
  try {
    await execAsync(command, { env, timeout: 8000, shell: '/bin/bash' });
    return true;
  } catch {
    return false;
  }
}

function findExistingHomebrewLockFile(): string | null {
  for (const lockFile of HOMEBREW_FFMPEG_LOCK_FILES) {
    if (fs.existsSync(lockFile)) return lockFile;
  }
  return null;
}

async function installFfmpegInBackground(): Promise<void> {
  try {
    const env = { ...process.env, PATH: extendPathEnv() };

    writeProgress({ status: 'installing', step: '正在检查 ffmpeg 是否已安装...' });
    const config = getWhisperConfig();
    const resolvedConfig = resolveWhisperConfigPaths(config);

    const configuredFfmpegIsUsable = isValidFfmpegExecutable(resolvedConfig.ffmpegPath) && await canRunFfmpeg(env, resolvedConfig.ffmpegPath);
    const pathFfmpegIsUsable = await canRunFfmpeg(env, 'ffmpeg');

    if (configuredFfmpegIsUsable || pathFfmpegIsUsable) {
      const usablePath = configuredFfmpegIsUsable
        ? resolveConfigPath(config.ffmpegPath)
        : resolveConfigPath('ffmpeg');
      persistUsableFfmpegPath(config.ffmpegPath, usablePath);
      writeProgress({ status: 'completed', step: 'ffmpeg 已经安装，无需重复安装。' });
      return;
    }

    // Step 1: Check if brew is available
    writeProgress({ status: 'installing', step: '正在检查 Homebrew...' });
    try {
      await execAsync('brew --version', { env });
    } catch {
      writeProgress({
        status: 'error',
        step: '未找到 Homebrew',
        error: '请先安装 Homebrew (https://brew.sh/) 或手动安装 ffmpeg。',
      });
      return;
    }

    // Step 2: Fix unlinked kegs (often causes ffmpeg install to fail)
    writeProgress({ status: 'installing', step: '正在修复依赖库链接...' });
    try {
      // 尝试链接常见的 ffmpeg 依赖
      await execAsync('brew link --overwrite libpng freetype fontconfig', { env }).catch(() => {});
    } catch (e) {
      console.warn('链接依赖失败，继续安装...', e);
    }

    // Step 3: Install ffmpeg
    writeProgress({ status: 'installing', step: '正在通过 Homebrew 安装 ffmpeg (可能需要几分钟)...' });
    try {
      // 使用 --quiet 减少不必要的 stderr 输出
      // 捕获 stderr 并记录，但不一定作为错误处理
      const { stdout, stderr } = await execAsync('brew install ffmpeg', {
        env,
        timeout: 1200000, // 增加到 20 分钟
      });
      console.log('ffmpeg install stdout:', stdout);
      if (stderr) console.warn('ffmpeg install stderr:', stderr);
    } catch (err: unknown) {
      // 即使报错，我们也检查一下 ffmpeg 是否其实安装成功了（Homebrew 经常因为系统版本老而报 warning 级的 error）
      const checkResult = await execAsync('ffmpeg -version', { env }).catch(() => null);
      
      if (!checkResult) {
        console.error('ffmpeg 安装彻底失败:', err);
        const errorObj = err instanceof Error ? err : new Error(String(err));
        let errorMsg = errorObj.message || '安装过程中发生错误';
        if (errorMsg.includes('macOS 13')) {
          errorMsg = '您的 macOS 13 版本较旧，Homebrew 编译 ffmpeg 失败。建议手动更新系统或尝试在终端运行 brew install ffmpeg 查看详细报错。';
        }
        writeProgress({
          status: 'error',
          step: '安装失败',
          error: errorMsg,
        });
        return;
      }
    }

    // Step 4: Verify installation
    writeProgress({ status: 'installing', step: '正在验证安装...' });
    const latestConfig = getWhisperConfig();
    const latestResolvedConfig = resolveWhisperConfigPaths(latestConfig);
    
    if (isValidFfmpegExecutable(latestResolvedConfig.ffmpegPath) && await canRunFfmpeg(env, latestResolvedConfig.ffmpegPath)) {
      persistUsableFfmpegPath(latestConfig.ffmpegPath, resolveConfigPath(latestConfig.ffmpegPath));
      writeProgress({ status: 'completed', step: 'ffmpeg 安装成功！' });
    } else if (await canRunFfmpeg(env, 'ffmpeg')) {
      persistUsableFfmpegPath(latestConfig.ffmpegPath, resolveConfigPath('ffmpeg'));
      writeProgress({ status: 'completed', step: 'ffmpeg 安装成功！' });
    } else {
      writeProgress({
        status: 'error',
        step: '验证失败',
        error: 'ffmpeg 已安装但无法正常运行，请检查系统路径。',
      });
    }
  } catch (err: unknown) {
    console.error('ffmpeg 安装过程出错:', err);
    const errorObj = err instanceof Error ? err : new Error(String(err));
    writeProgress({
      status: 'error',
      step: '安装出错',
      error: errorObj.message || '安装过程中发生未知错误',
    });
  }
}

export async function POST() {
  const config = getWhisperConfig();

  // 如果已经安装，直接返回
  const usableFfmpegPath = resolveUsableFfmpegPath(config.ffmpegPath);
  if (usableFfmpegPath) {
    const displayPath = persistUsableFfmpegPath(config.ffmpegPath, usableFfmpegPath);
    return NextResponse.json({
      success: true,
      alreadyInstalled: true,
      message: 'ffmpeg 已经安装',
      ffmpegPath: displayPath,
    });
  }

  // 如果检测到 Homebrew 锁，提示用户等待或清理锁
  const existingLockFile = findExistingHomebrewLockFile();
  if (existingLockFile) {
    writeProgress({
      status: 'installing',
      step: '检测到 Homebrew 正在安装或残留锁，请稍候（或退出所有 brew 进程后重试）',
      error: `Homebrew 锁文件存在，可能是上一轮安装未正常结束导致。可尝试在终端执行：rm "${existingLockFile}"`,
    });

    return NextResponse.json({
      success: true,
      alreadyInstalling: true,
      message: '检测到 Homebrew 锁文件，安装可能仍在进行或被锁定',
      lockFile: existingLockFile,
    });
  }

  // 初始化进度文件
  writeProgress({ status: 'installing', step: '正在准备安装 ffmpeg...' });

  // 后台执行安装逻辑
  installFfmpegInBackground().catch(console.error);

  return NextResponse.json({
    success: true,
    message: 'ffmpeg 安装已在后台启动',
  });
}
