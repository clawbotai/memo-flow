// AI API 客户端 - Qwen/DeepSeek

const QWEN_API_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation';

export interface AIAnalysisResult {
  viewpoints: Array<{
    title: string;
    arguments: string[];
  }>;
  controversies: Array<{
    topic: string;
    pro: string;
    con: string;
  }>;
  summary: string;
  tags: string[];
}

interface QwenAPIResponse {
  output: {
    text: string;
    finish_reason: string;
  };
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  request_id: string;
}

/**
 * 使用 Qwen API 分析内容
 * 支持自动重试机制
 */
export async function analyzeWithAI(
  transcript: string, 
  retries = 3
): Promise<AIAnalysisResult> {
  const apiKey = process.env.QWEN_API_KEY;
  
  if (!apiKey) {
    console.warn('QWEN_API_KEY not configured, using mock data');
    return getMockAnalysis();
  }

  const systemPrompt = '你是一个专业的内容分析师，擅长从视频、播客等内容中提取核心观点、争议点和关键信息。你需要以结构化的 JSON 格式返回分析结果。';
  
  const userPrompt = `请分析以下内容，提取核心观点、争议点和总结：

${transcript}

请严格按以下 JSON 格式返回（不要包含其他文字）：
{
  "viewpoints": [
    {"title": "观点标题", "arguments": ["论据 1", "论据 2"]}
  ],
  "controversies": [
    {"topic": "争议话题", "pro": "正方观点", "con": "反方观点"}
  ],
  "summary": "内容总结",
  "tags": ["标签 1", "标签 2"]
}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[Qwen API] Attempt ${attempt}/${retries}`);
      
      const response = await fetch(QWEN_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'X-DashScope-SSE': 'disable'
        },
        body: JSON.stringify({
          model: 'qwen-turbo',
          input: {
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ]
          },
          parameters: {
            result_format: 'text',
            temperature: 0.7,
            max_tokens: 2000
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Qwen API error: ${response.status} ${errorData.message || response.statusText}`
        );
      }

      const data: QwenAPIResponse = await response.json();
      console.log(`[Qwen API] Success, tokens: ${data.usage?.input_tokens}/${data.usage?.output_tokens}`);
      
      // 解析 AI 返回的 JSON
      try {
        const result = JSON.parse(data.output.text.trim());
        return validateAnalysisResult(result);
      } catch (parseError) {
        console.error('Failed to parse AI response:', data.output.text);
        if (attempt === retries) {
          throw new Error('AI response is not valid JSON');
        }
      }
    } catch (error) {
      console.error(`[Qwen API] Attempt ${attempt} failed:`, error);
      if (attempt === retries) {
        console.error('[Qwen API] All retries failed, using mock data');
        return getMockAnalysis();
      }
      // 等待后重试（指数退避）
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
  
  return getMockAnalysis();
}

/**
 * 验证 AI 分析结果的结构
 */
function validateAnalysisResult(result: any): AIAnalysisResult {
  return {
    viewpoints: Array.isArray(result.viewpoints) ? result.viewpoints : [],
    controversies: Array.isArray(result.controversies) ? result.controversies : [],
    summary: typeof result.summary === 'string' ? result.summary : '',
    tags: Array.isArray(result.tags) ? result.tags : []
  };
}

export async function generateNote(
  analysis: AIAnalysisResult,
  template: 'default' | 'xiaohongshu' | 'wechat' | 'zhihu' = 'default'
): Promise<string> {
  const apiKey = process.env.QWEN_API_KEY;
  
  if (!apiKey) {
    return getMockNote(template);
  }

  const templates = {
    default: '标准笔记格式',
    xiaohongshu: '小红书风格，包含 emoji 和标签',
    wechat: '公众号文章格式',
    zhihu: '知乎回答格式'
  };

  const prompt = `
请根据以下分析结果生成${templates[template]}：

核心观点：
${analysis.viewpoints.map(v => `- ${v.title}`).join('\n')}

争议点：
${analysis.controversies.map(c => `- ${c.topic}: ${c.pro} vs ${c.con}`).join('\n')}

总结：${analysis.summary}

标签：${analysis.tags.join(', ')}
`;

  try {
    const response = await fetch(QWEN_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'qwen-turbo',
        input: {
          messages: [
            { role: 'system', content: '你是一个专业的内容创作者，擅长将分析结果转化为优质笔记。' },
            { role: 'user', content: prompt }
          ]
        }
      })
    });

    const data = await response.json();
    return data.output.text;
  } catch (error) {
    console.error('Note generation error:', error);
    return getMockNote(template);
  }
}

function getMockAnalysis(): AIAnalysisResult {
  return {
    viewpoints: [
      {
        title: 'AI 将重塑内容创作行业',
        arguments: ['自动化写作工具普及', '人机协作成为主流']
      },
      {
        title: '创作者需要掌握 AI 技能',
        arguments: ['提示词工程', 'AI 工具工作流']
      },
      {
        title: '内容为王依然成立',
        arguments: ['独特视角不可替代', '情感连接是关键']
      }
    ],
    controversies: [
      {
        topic: 'AI 会取代创作者吗？',
        pro: '会取代重复性工作',
        con: '创造力无法替代'
      }
    ],
    summary: '这是一个示例分析总结，实际使用时会调用 AI API 生成真实内容。',
    tags: ['#AI', '#内容创作', '#效率工具']
  };
}

function getMockNote(template: string): string {
  const notes: Record<string, string> = {
    default: `# AI 趋势分析

## 核心观点

1. AI 将重塑内容创作行业
2. 创作者需要掌握 AI 技能
3. 内容为王依然成立

## 我的思考

在这里编辑你的思考...`,

    xiaohongshu: `🧠 AI 趋势分析｜创作者必看！

💡 核心观点：
1️⃣ AI 将重塑内容创作行业
2️⃣ 创作者需要掌握 AI 技能
3️⃣ 内容为王依然成立

📝 我的思考：
...

#AI #内容创作 #效率工具 #创作者经济`,

    wechat: `# AI 将如何影响内容创作行业？

最近看了一个关于 AI 趋势的分享，很有启发...

## 01 AI 将重塑内容创作行业

## 02 创作者需要掌握 AI 技能

## 03 内容为王依然成立

---
**推荐阅读** | **点赞** | **在看**`,

    zhihu: `## AI 会如何影响内容创作行业？

谢邀。

最近关注到 AI 在内容创作领域的应用，分享几个核心观点：

**1. AI 将重塑内容创作行业**

**2. 创作者需要掌握 AI 技能**

**3. 内容为王依然成立**

以上。`
  };

  return notes[template] || notes.default;
}
