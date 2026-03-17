import { NextRequest, NextResponse } from 'next/server';
import { Analysis, Viewpoint, Controversy } from '@/types';
import { analyzeWithAI } from '@/lib/ai';

export async function POST(request: NextRequest) {
  try {
    const { contentId, transcript } = await request.json();
    
    if (!contentId) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Content ID is required',
          code: 'MISSING_CONTENT_ID'
        },
        { status: 400 }
      );
    }

    // 如果有 transcript，使用 AI 分析
    let viewpoints: Viewpoint[] = [];
    let controversies: Controversy[] = [];
    let summary = '';
    let tags: string[] = [];

    if (transcript) {
      console.log('[Analyze API] Starting AI analysis...');
      const aiResult = await analyzeWithAI(transcript);
      
      viewpoints = aiResult.viewpoints.map((v, i) => ({
        id: `v${i + 1}`,
        title: v.title,
        arguments: v.arguments
      }));

      controversies = aiResult.controversies.map((c, i) => ({
        id: `c${i + 1}`,
        topic: c.topic,
        pro: c.pro,
        con: c.con
      }));

      summary = aiResult.summary;
      tags = aiResult.tags;

      console.log(`[Analyze API] AI analysis complete: ${viewpoints.length} viewpoints, ${controversies.length} controversies`);
    } else {
      // 没有 transcript 时使用模拟数据
      viewpoints = [
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
      ];

      controversies = [
        {
          id: 'c1',
          topic: 'AI 会取代创作者吗？',
          pro: '会取代重复性工作',
          con: '创造力无法替代'
        }
      ];

      summary = '这是一个示例分析总结，实际使用时会调用 AI API 生成真实内容。';
      tags = ['#AI', '#内容创作', '#效率工具'];
    }
    
    const analysis: Analysis = {
      id: `analysis_${Date.now()}`,
      content: {
        id: contentId,
        url: 'https://youtube.com/watch?v=example',
        platform: 'youtube',
        title: '分析内容',
        description: 'AI 分析结果',
        duration: 932
      },
      status: 'completed',
      viewpoints,
      controversies,
      summary,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    return NextResponse.json({
      success: true,
      data: analysis,
      meta: {
        aiPowered: !!transcript,
        viewpointsCount: viewpoints.length,
        controversiesCount: controversies.length
      }
    });
  } catch (error) {
    console.error('Analyze error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : '分析失败',
        code: 'ANALYSIS_FAILED'
      },
      { status: 500 }
    );
  }
}
