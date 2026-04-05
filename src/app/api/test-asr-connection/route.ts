import { NextRequest, NextResponse } from 'next/server';
import { testQwenASRConnection } from '@/lib/qwen-asr';
import type { OnlineASRConfig } from '@/types';

/**
 * POST /api/test-asr-connection
 * 测试在线 ASR API 连接是否可用
 */
export async function POST(request: NextRequest) {
  try {
    const config: OnlineASRConfig = await request.json();

    if (!config.apiKey) {
      return NextResponse.json({
        success: false,
        message: 'API Key 不能为空',
      });
    }

    const result = await testQwenASRConnection(config);

    return NextResponse.json(result);
  } catch (error) {
    console.error('ASR 连接测试失败:', error);
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : '连接测试失败',
    });
  }
}
