import { NextRequest, NextResponse } from 'next/server';
import { detectPlatform } from '@/lib/utils';
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
    
    const mockContent: Content = {
      id: `content_${Date.now()}`,
      url,
      platform,
      title: '示例内容标题',
      description: '这是一个示例内容描述',
      duration: platform === 'youtube' ? 932 : undefined,
      thumbnail: 'https://via.placeholder.com/1280x720',
      author: '示例作者',
      publishedAt: new Date().toISOString()
    };
    
    return NextResponse.json({
      success: true,
      data: mockContent
    });
  } catch (error) {
    console.error('Parse error:', error);
    return NextResponse.json(
      { success: false, error: '解析失败' },
      { status: 500 }
    );
  }
}
