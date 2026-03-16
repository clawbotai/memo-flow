// AI API 客户端 - Qwen/DeepSeek

const QWEN_API_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

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

export async function analyzeWithAI(transcript: string): Promise<AIAnalysisResult> {
  const apiKey = process.env.QWEN_API_KEY || process.env.DEEPSEEK_API_KEY;
  
  if (!apiKey) {
    // 返回模拟数据用于开发测试
    return getMockAnalysis();
  }

  const prompt = `
请分析以下内容，提取核心观点、争议点和总结：

${transcript}

请按以下 JSON 格式返回：
{
  "viewpoints": [
    {"title": "观点标题", "arguments": ["论据 1", "论据 2"]}
  ],
  "controversies": [
    {"topic": "争议话题", "pro": "正方观点", "con": "反方观点"}
  ],
  "summary": "内容总结",
  "tags": ["标签 1", "标签 2"]
}
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
            { role: 'system', content: '你是一个专业的内容分析师，擅长提取核心观点和争议点。' },
            { role: 'user', content: prompt }
          ]
        }
      })
    });

    const data = await response.json();
    
    // 解析 AI 返回的结果
    const result = JSON.parse(data.output.text);
    return result as AIAnalysisResult;
  } catch (error) {
    console.error('AI Analysis error:', error);
    return getMockAnalysis();
  }
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
