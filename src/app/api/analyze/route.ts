import { NextRequest, NextResponse } from 'next/server';
import { Analysis, Viewpoint, Controversy } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const { contentId } = await request.json();
    
    if (!contentId) {
      return NextResponse.json(
        { success: false, error: 'Content ID is required' },
        { status: 400 }
      );
    }
    
    const mockAnalysis: Analysis = {
      id: `analysis_${Date.now()}`,
      content: {
        id: contentId,
        url: 'https://youtube.com/watch?v=example',
        platform: 'youtube',
        title: '示例视频',
        description: '示例描述',
        duration: 932
      },
      status: 'completed',
      viewpoints: [
        {
          id: 'v1',
          title: 'AI 将重塑内容创作行业',
          arguments: ['自动化写作工具普及', '人机协作成为主流']
        },
        {
          id: 'v2',
          title: '创作者需要掌握 AI 技能',
          arguments: ['提示词工程', 'AI 工具工作流']
        },
        {
          id: 'v3',
          title: '内容为王依然成立',
          arguments: ['独特视角不可替代', '情感连接是关键']
        }
      ] as Viewpoint[],
      controversies: [
        {
          id: 'c1',
          topic: 'AI 会取代创作者吗？',
          pro: '会取代重复性工作',
          con: '创造力无法替代'
        }
      ] as Controversy[],
      summary: '这是一个示例分析总结',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    return NextResponse.json({
      success: true,
      data: mockAnalysis
    });
  } catch (error) {
    console.error('Analyze error:', error);
    return NextResponse.json(
      { success: false, error: '分析失败' },
      { status: 500 }
    );
  }
}
