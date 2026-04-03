import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getWhisperConfig, saveWhisperConfig } from '@/lib/whisper-config';

export const dynamic = 'force-dynamic';

const PROJECT_ROOT = process.cwd();
const WHISPER_DIR = path.join(PROJECT_ROOT, 'whisper.cpp');
const PROGRESS_FILE = path.join(PROJECT_ROOT, '.whisper-install-progress.json');

interface InstallProgress {
  status: 'cloning' | 'compiling' | 'completed' | 'error';
  step: string;
  error?: string;
}

function writeProgress(progress: InstallProgress): void {
  try {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), 'utf8');
  } catch (e) {
    console.error('写入安装进度失败:', e);
  }
}

function execAsync(command: string, options: { cwd?: string } = {}): Promise<string> {
  // Ensure child process inherits a full PATH including /opt/homebrew/bin
  // (Node.js child_process may not load the user's shell profile)
  const shellPath = process.env.PATH || '';
  const extraPaths = ['/opt/homebrew/bin', '/opt/homebrew/sbin', '/usr/local/bin'];
  const fullPath = extraPaths.concat(shellPath.split(':')).filter(Boolean);
  const uniquePath = Array.from(new Set(fullPath)).join(':');

  return new Promise((resolve, reject) => {
    exec(command, {
      ...options,
      maxBuffer: 10 * 1024 * 1024,
      timeout: 600000,
      env: { ...process.env, PATH: uniquePath },
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${error.message}\n${stderr}`));
        return;
      }
      resolve(stdout);
    });
  });
}

async function installWhisperInBackground(): Promise<void> {
  try {
    // Step 1: Clone
    if (!fs.existsSync(WHISPER_DIR)) {
      writeProgress({ status: 'cloning', step: '正在克隆 whisper.cpp 仓库...' });
      await execAsync(
        'git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git',
        { cwd: PROJECT_ROOT }
      );
    } else {
      writeProgress({ status: 'cloning', step: 'whisper.cpp 仓库已存在，跳过克隆' });
    }

    // Step 2: Ensure cmake is available
    const cliBinary = path.join(WHISPER_DIR, 'build', 'bin', 'whisper-cli');
    if (!fs.existsSync(cliBinary)) {
      try {
        await execAsync('cmake --version');
      } catch {
        writeProgress({ status: 'compiling', step: '正在安装编译工具 cmake...' });
        await execAsync('brew install cmake');
      }

      // Compile with CMake
      writeProgress({ status: 'compiling', step: '正在编译 whisper.cpp（可能需要几分钟）...' });
      await execAsync('cmake -B build', { cwd: WHISPER_DIR });
      await execAsync('cmake --build build --config Release', { cwd: WHISPER_DIR });
    }

    // Verify
    if (!fs.existsSync(cliBinary)) {
      throw new Error('编译完成但未找到 whisper-cli 可执行文件');
    }

    // Update config
    const config = getWhisperConfig();
    config.whisperPath = cliBinary;
    saveWhisperConfig(config);

    writeProgress({ status: 'completed', step: 'whisper.cpp 安装完成' });
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
    const config = getWhisperConfig();
    if (fs.existsSync(config.whisperPath)) {
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
