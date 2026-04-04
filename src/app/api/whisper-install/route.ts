import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { getWhisperConfig, saveWhisperConfig, resolveWhisperConfigPaths, toProjectDisplayPath, isValidWhisperExecutable } from '@/lib/whisper-config';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

const PROJECT_ROOT = process.cwd();
const WHISPER_DIR = path.join(PROJECT_ROOT, 'whisper.cpp');
const PROGRESS_FILE = path.join(PROJECT_ROOT, '.whisper-install-progress.json');

interface InstallProgress {
  status: 'cloning' | 'compiling' | 'completed' | 'error';
  step: string;
  error?: string;
}

function getWhisperCliCandidates(): string[] {
  const isWindows = process.platform === 'win32';
  const binaryName = isWindows ? 'whisper-cli.exe' : 'whisper-cli';
  const candidates = [
    path.join(WHISPER_DIR, 'build', 'bin', binaryName),
    // 添加其他可能的可执行文件名作为候选
    path.join(WHISPER_DIR, 'build', 'bin', 'main'), // 某些编译环境下可能生成 main 而不是 whisper-cli
  ];

  if (isWindows) {
    candidates.unshift(path.join(WHISPER_DIR, 'build', 'bin', 'Release', binaryName));
  }

  return candidates;
}

function resolveWhisperCliPath(): string {
  const candidates = getWhisperCliCandidates();
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

function writeProgress(progress: InstallProgress): void {
  try {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), 'utf8');
  } catch (e) {
    console.error('写入安装进度失败:', e);
  }
}

function extendPathEnv(): string {
  // Ensure child process inherits a full PATH including /opt/homebrew/bin
  // (Node.js child_process may not load the user's shell profile)
  const shellPath = process.env.PATH || '';
  const extraPaths = ['/opt/homebrew/bin', '/opt/homebrew/sbin', '/usr/local/bin'];
  const fullPath = extraPaths.concat(shellPath.split(':')).filter(Boolean);
  const uniquePath = Array.from(new Set(fullPath)).join(':');
  return uniquePath;
}

async function installWhisperInBackground(): Promise<void> {
  try {
    // Step 1: Clone
    if (!fs.existsSync(WHISPER_DIR)) {
      writeProgress({ status: 'cloning', step: '正在克隆 whisper.cpp 仓库...' });
      await execAsync(
        'git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git',
        {
          cwd: PROJECT_ROOT,
          env: { ...process.env, PATH: extendPathEnv() },
          timeout: 300000, // 5分钟超时
          maxBuffer: 10 * 1024 * 1024,
        }
      );
    } else {
      writeProgress({ status: 'cloning', step: 'whisper.cpp 仓库已存在，跳过克隆' });
    }

    // Step 2: Ensure cmake is available
    const cliBinary = resolveWhisperCliPath();

    // Check if binary exists and is executable before compiling
    if (!fs.existsSync(cliBinary) || !isValidWhisperExecutable(cliBinary)) {
      writeProgress({ status: 'compiling', step: '正在检查编译工具...' });

      // Check if cmake is available
      try {
        await execAsync('cmake --version', {
          env: { ...process.env, PATH: extendPathEnv() },
        });
      } catch {
        writeProgress({ status: 'compiling', step: '正在安装编译工具 cmake...' });
        try {
          await execAsync('brew install cmake', {
            env: { ...process.env, PATH: extendPathEnv() },
            timeout: 300000, // 5分钟超时
          });
        } catch {
          // 如果 brew 不可用，在某些系统上可能需要使用包管理器安装 cmake
          console.warn('brew 安装 cmake 失败，您可能需要手动安装 cmake');
        }
      }

      // Compile with CMake
      writeProgress({ status: 'compiling', step: '正在编译 whisper.cpp（可能需要几分钟）...' });
      await execAsync('cmake -B build', {
        cwd: WHISPER_DIR,
        env: { ...process.env, PATH: extendPathEnv() },
        timeout: 300000, // 5分钟超时
        maxBuffer: 10 * 1024 * 1024,
      });
      await execAsync('cmake --build build --config Release', {
        cwd: WHISPER_DIR,
        env: { ...process.env, PATH: extendPathEnv() },
        timeout: 600000, // 10分钟超时
        maxBuffer: 10 * 1024 * 1024,
      });
    }

    // Re-resolve the path after compilation to ensure we have the latest path
    const installedCliBinary = resolveWhisperCliPath();
    console.log('编译后检查路径:', installedCliBinary);
    console.log('文件是否存在:', fs.existsSync(installedCliBinary));

    if (!fs.existsSync(installedCliBinary)) {
      throw new Error(`编译完成后找不到预期的可执行文件: ${installedCliBinary}`);
    }

    // Verify the binary is properly compiled and executable
    console.log('正在验证可执行文件:', installedCliBinary);
    console.log('文件是否存在:', fs.existsSync(installedCliBinary));

    if (!isValidWhisperExecutable(installedCliBinary)) {
      console.log('可执行文件验证失败，尝试检查文件权限...');
      try {
        const stats = fs.statSync(installedCliBinary);
        console.log(`文件权限: ${stats.mode.toString(8)}`);
        console.log(`是否为文件: ${stats.isFile()}`);
        console.log(`文件大小: ${stats.size} bytes`);

        // 尝试手动给文件添加执行权限
        fs.chmodSync(installedCliBinary, 0o755);
        console.log('已尝试添加执行权限');

        // 再次验证
        if (!isValidWhisperExecutable(installedCliBinary)) {
          throw new Error('编译完成但未能验证 whisper-cli 可执行文件（权限可能有问题）');
        }
      } catch (chmodError) {
        console.error('尝试修复权限时发生错误:', chmodError);
        throw new Error('编译完成但未能验证 whisper-cli 可执行文件（权限问题）');
      }
    }

    // Update config
    const config = getWhisperConfig();
    config.whisperPath = toProjectDisplayPath(installedCliBinary);
    saveWhisperConfig(config);

    writeProgress({ status: 'completed', step: 'whisper.cpp 安装完成' });

    // Clean up progress file after successful installation
    try {
      fs.unlinkSync(PROGRESS_FILE);
    } catch {
      // ignore cleanup errors
    }
  } catch (error) {
    console.error('whisper.cpp 安装失败:', error);

    writeProgress({
      status: 'error',
      step: '安装失败',
      error: error instanceof Error ? error.message : '未知错误',
    });
  }
}

export async function POST() {
  try {
    // Check if already installed
    const config = resolveWhisperConfigPaths(getWhisperConfig());
    if (isValidWhisperExecutable(config.whisperPath)) {
      return NextResponse.json({
        success: true,
        message: 'whisper.cpp 已安装',
        alreadyInstalled: true,
      });
    }

    // Check if install is in progress
    if (fs.existsSync(PROGRESS_FILE)) {
      try {
        const progress: InstallProgress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
        if (progress.status === 'cloning' || progress.status === 'compiling') {
          return NextResponse.json(
            { success: false, error: '安装正在进行中' },
            { status: 409 }
          );
        }
      } catch {
        // ignore
      }
    }

    // Start background install
    installWhisperInBackground().catch((err) => {
      console.error('后台安装任务失败:', err);
    });

    return NextResponse.json({ success: true, message: '安装已启动' });
  } catch (error) {
    console.error('启动安装失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '启动安装失败' },
      { status: 500 }
    );
  }
}
