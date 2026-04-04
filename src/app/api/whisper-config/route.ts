import { NextRequest, NextResponse } from 'next/server';
import { getWhisperConfig, saveWhisperConfig } from '@/lib/whisper-config';
import { WhisperConfig } from '@/types';

/**
 * GET /api/whisper-config
 * 获取当前的 Whisper 配置
 * 返回合并环境变量后的配置
 */
export async function GET() {
  try {
    const config = getWhisperConfig();

    return NextResponse.json({
      success: true,
      data: config,
    });
  } catch (error) {
    console.error('获取 whisper 配置失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取配置失败',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/whisper-config
 * 保存 Whisper 配置
 * 请求体: WhisperConfig 对象
 * 返回保存后的配置（包含环境变量覆盖）
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const currentConfig = getWhisperConfig();

    // 验证请求体
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        {
          success: false,
          error: '请求体必须是有效的 JSON 对象',
        },
        { status: 400 }
      );
    }

    // 验证必填字段
    const requiredFields: (keyof WhisperConfig)[] = [
      'whisperPath',
      'modelPath',
      'modelName',
      'threads',
    ];

    for (const field of requiredFields) {
      if (body[field] === undefined || body[field] === null) {
        return NextResponse.json(
          {
            success: false,
            error: `缺少必填字段: ${field}`,
          },
          { status: 400 }
        );
      }
    }

    // 验证 threads 是正整数
    if (
      typeof body.threads !== 'number' ||
      !Number.isInteger(body.threads) ||
      body.threads < 1
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'threads 必须是正整数',
        },
        { status: 400 }
      );
    }

    // 验证 modelName 是有效值
    const validModelNames = ['tiny', 'base', 'small', 'medium', 'large'];
    if (!validModelNames.includes(body.modelName)) {
      return NextResponse.json(
        {
          success: false,
          error: `modelName 必须是以下值之一: ${validModelNames.join(', ')}`,
        },
        { status: 400 }
      );
    }

    // 构建配置对象
    const config: WhisperConfig = {
      whisperPath: String(body.whisperPath),
      modelPath: String(body.modelPath),
      modelName: String(body.modelName),
      threads: Number(body.threads),
      outputDir: body.outputDir ? String(body.outputDir) : currentConfig.outputDir,
      ffmpegPath: body.ffmpegPath ? String(body.ffmpegPath) : currentConfig.ffmpegPath,
    };

    // 保存配置
    const savedConfig = saveWhisperConfig(config);

    return NextResponse.json({
      success: true,
      data: savedConfig,
    });
  } catch (error) {
    console.error('保存 whisper 配置失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '保存配置失败',
      },
      { status: 500 }
    );
  }
}
