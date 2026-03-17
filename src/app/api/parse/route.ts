import { NextRequest, NextResponse } from 'next/server';
import { detectPlatform, parseUrlReal } from '@/lib/scraper';
import { Content, Platform } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    
    if (!url) {
      return NextResponse.json(
        { success: false, error: 'URL is required' },
        { status: 400 }
      );
    }
    
    const platformName = detectPlatform(url);
    
    if (platformName === 'unknown') {
      return NextResponse.json(
        { success: false, error: 'Unsupported platform' },
        { status: 400 }
      );
    }
    
    // 类型断言：将 string 转换为 Platform 类型
    const platform = platformName as Platform;

    try {
      // 调用真实解析器
      const content = await parseUrlReal(url);

      return NextResponse.json({
        success: true,
        data: content
      });
    } catch (error) {
      console.error('Parse error:', error);
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : '解析失败' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Parse error:', error);
    return NextResponse.json(
      { success: false, error: '解析失败' },
      { status: 500 }
    );
  }
}
