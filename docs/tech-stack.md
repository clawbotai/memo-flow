# 🛠️ MemoFlow - 技术栈文档

## 📦 核心技术栈

### 前端框架
- **Next.js 14** - React 框架，支持 SSR/SSG
- **TypeScript** - 类型安全
- **React 18** - UI 库

### 样式系统
- **TailwindCSS 3** - 原子化 CSS
- **shadcn/ui** - 高质量组件库
- **Radix UI** - 无障碍组件原语

### AI 服务
- **Qwen API** - 主要 AI 模型（通义千问）
- **DeepSeek API** - 备用 AI 模型
- **Whisper API** - 语音转文字

### 部署
- **Vercel** - 前端部署
- **Railway** - 后端服务（可选）

---

## 📁 项目结构

```
memoai/
├── src/
│   ├── app/              # Next.js App Router
│   │   ├── layout.tsx    # 根布局
│   │   ├── page.tsx      # 首页
│   │   ├── analysis/     # 分析结果页
│   │   ├── note/         # 笔记编辑页
│   │   └── library/      # 知识库
│   ├── components/       # React 组件
│   │   ├── ui/           # shadcn/ui 组件
│   │   ├── layout/       # 布局组件
│   │   └── features/     # 功能组件
│   ├── lib/              # 工具函数
│   │   ├── api.ts        # API 客户端
│   │   ├── utils.ts      # 通用工具
│   │   └── constants.ts  # 常量定义
│   ├── types/            # TypeScript 类型
│   │   └── index.ts      # 类型定义
│   └── styles/           # 样式文件
│       └── globals.css   # 全局样式
├── docs/                 # 文档
├── design/               # 设计稿
├── public/               # 静态资源
└── package.json
```

---

## 🔌 API 设计

### 1. 内容解析 API

```typescript
POST /api/parse
Request:
{
  url: string,        // YouTube/小宇宙/小红书链接
  platform: string    // 自动检测或手动指定
}

Response:
{
  id: string,
  status: 'pending' | 'processing' | 'completed' | 'failed',
  content: {
    title: string,
    description: string,
    duration?: number,
    transcript?: string,
    thumbnail?: string
  }
}
```

### 2. AI 分析 API

```typescript
POST /api/analyze
Request:
{
  contentId: string,
  transcript: string
}

Response:
{
  viewpoints: Array<{
    title: string,
    arguments: string[]
  }>,
  controversies: Array<{
    topic: string,
    pro: string,
    con: string
  }>,
  summary: string
}
```

### 3. 笔记生成 API

```typescript
POST /api/note/generate
Request:
{
  analysisId: string,
  template: 'default' | 'xiaohongshu' | 'wechat' | 'zhihu'
}

Response:
{
  title: string,
  content: string,
  tags: string[]
}
```

---

## 🗄️ 数据结构

### Analysis

```typescript
interface Analysis {
  id: string;
  userId: string;
  url: string;
  platform: Platform;
  status: AnalysisStatus;
  content: Content;
  viewpoints: Viewpoint[];
  controversies: Controversy[];
  createdAt: Date;
  updatedAt: Date;
}

type Platform = 'youtube' | 'xiaoyuzhou' | 'xiaohongshu' | 'bilibili';
type AnalysisStatus = 'pending' | 'processing' | 'completed' | 'failed';
```

### Note

```typescript
interface Note {
  id: string;
  userId: string;
  analysisId: string;
  title: string;
  content: string;
  tags: string[];
  platform: Platform;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

---

## 🔐 环境变量

```bash
# AI API Keys
QWEN_API_KEY=your_qwen_api_key
DEEPSEEK_API_KEY=your_deepseek_api_key

# Database (可选，MVP 可用文件系统)
DATABASE_URL=your_database_url

# Vercel
NEXT_PUBLIC_VERCEL_URL=your_vercel_url
```

---

## 📊 开发路线图

### Week 1: 基础架构
- [x] Next.js 项目搭建
- [x] TypeScript 配置
- [x] TailwindCSS 配置
- [ ] shadcn/ui 组件安装
- [ ] 基础布局组件

### Week 2: 核心功能
- [ ] YouTube 链接解析
- [ ] 字幕提取
- [ ] AI 观点提取
- [ ] 分析结果展示

### Week 3: 内容产出
- [ ] 笔记生成
- [ ] 多平台适配
- [ ] 导出功能

### Week 4: 优化部署
- [ ] 性能优化
- [ ] SEO 优化
- [ ] Vercel 部署
- [ ] 域名配置

---

## 🧪 测试策略

### 单元测试
- 工具函数测试
- 组件渲染测试

### 集成测试
- API 端点测试
- 数据库操作测试

### E2E 测试
- 关键用户流程测试

---

## 📈 性能指标

| 指标 | 目标 |
|------|------|
| 首屏加载 | < 2s |
| 分析耗时 | 30s - 2min |
| 页面性能 | Lighthouse 90+ |
| SEO 评分 | 90+ |

---

*2026-03-15 创建*
