import { NextResponse } from 'next/server';
import fs from 'fs';
import { isValidWhisperExecutable, getWhisperConfig, formatFileSize, inferModelName, resolveWhisperConfigPaths, isValidFfmpegExecutable } from '@/lib/whisper-config';
import { WhisperStatus } from '@/types';

/**
 * GET /api/whisper-status
 * 获取 whisper.cpp 的状态信息
 * 包括安装状态、模型状态、文件大小等
 */
export async function GET() {
  try {
    // 读取当前配置
    const config = getWhisperConfig();
    const resolvedConfig = resolveWhisperConfigPaths(config);

    // 检查 whisper.cpp 是否安装并可用
    const whisperInstalled = isValidWhisperExecutable(resolvedConfig.whisperPath);

    // 检查模型文件是否存在
    const modelInstalled = fs.existsSync(resolvedConfig.modelPath);

    // 获取模型文件大小
    let modelSize = '0 B';
    if (modelInstalled) {
      try {
        const stats = fs.statSync(resolvedConfig.modelPath);
        modelSize = formatFileSize(stats.size);
      } catch (error) {
        console.error('获取模型文件大小失败:', error);
      }
    }

    // 推断模型名称（从路径中）
    const modelName = inferModelName(resolvedConfig.modelPath);

    // 检查 ffmpeg 是否安装
    const ffmpegInstalled = isValidFfmpegExecutable(resolvedConfig.ffmpegPath);

    const status: WhisperStatus = {
      helperConnected: false,
      whisperInstalled,
      modelInstalled,
      ffmpegInstalled,
      whisperPath: config.whisperPath,
      modelPath: config.modelPath,
      ffmpegPath: config.ffmpegPath,
      modelName,
      modelSize,
      platform: process.platform,
      installMode: 'mixed',
    };

    return NextResponse.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error('获取 whisper 状态失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取状态失败',
      },
      { status: 500 }
    );
  }
}
