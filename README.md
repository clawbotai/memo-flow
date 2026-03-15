# 🧠 MemoFlow

**AI 驱动的内容分析与创作助手**

从内容消费者 → 内容创作者

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-org/memoai)

---

## 🎯 产品定位

粘贴自媒体链接（YouTube/小宇宙/小红书等）→ AI 提取核心观点 → 生成笔记/二创内容

类似产品：https://memo.ac/zh/

---

## ✨ 功能特点

- 🔗 **多平台支持** - YouTube/小宇宙/小红书/B 站
- 🧠 **AI 分析** - 自动提取 3-5 个核心观点
- 💬 **批判思考** - 争议点识别 + 反面观点
- 📝 **笔记生成** - 一键生成，多平台格式适配
- 📚 **知识库** - 搜索/筛选/统计

---

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env.local
```

编辑 `.env.local`:

```bash
# AI API Keys
QWEN_API_KEY=your_qwen_api_key
DEEPSEEK_API_KEY=your_deepseek_api_key
```

### 3. 运行开发服务器

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)

---

## 📁 项目结构

```
memoai/
├── src/
│   ├── app/              # Next.js App Router
│   │   ├── api/          # API 路由
│   │   ├── analysis/     # 分析结果页
│   │   ├── note/         # 笔记编辑页
│   │   ├── library/      # 知识库
│   │   └── page.tsx      # 首页
│   ├── components/       # React 组件
│   │   └── ui/           # shadcn/ui 组件
│   ├── lib/              # 工具函数
│   │   ├── api.ts        # API 客户端
│   │   └── utils.ts      # 通用工具
│   └── types/            # TypeScript 类型
├── docs/                 # 文档
├── design/               # 设计稿
└── public/               # 静态资源
```

---

## 🛠️ 技术栈

- **前端**: Next.js 14 + TypeScript
- **样式**: TailwindCSS + shadcn/ui
- **AI**: Qwen / DeepSeek API
- **部署**: Vercel

---

## 📊 开发进度

| 阶段 | 进度 | 状态 |
|------|------|------|
| Phase 1 - 产品设计 | 100% | ✅ 完成 |
| Phase 2 - 功能开发 | 80% | 🔄 进行中 |
| Phase 3 - 优化部署 | 0% | ⏳ 待开始 |

**总体进度**: 65%

---

## 📝 API 文档

### 解析链接

```bash
POST /api/parse
{
  "url": "https://youtube.com/watch?v=example"
}
```

### AI 分析

```bash
POST /api/analyze
{
  "contentId": "content_123"
}
```

### 生成笔记

```bash
POST /api/note/generate
{
  "analysisId": "analysis_123",
  "template": "xiaohongshu"
}
```

---

## 👥 团队

| 成员 | 角色 |
|------|------|
| 🤖 小 U | UI 设计师 |
| 🤖 小品 | 产品经理 |
| 🤖 小码 | 开发工程师 |

---

## 📄 License

MIT

---

*2026-03-15 创建*
