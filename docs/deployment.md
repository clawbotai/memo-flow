# 🚀 MemoAI - 部署指南

## Vercel 部署

### 1. 准备工作

确保项目已推送到 GitHub:

```bash
git push origin main
```

### 2. Vercel 部署

#### 方式一：Vercel Dashboard

1. 访问 https://vercel.com/new
2. 导入 GitHub 仓库
3. 配置环境变量
4. 点击 Deploy

#### 方式二：Vercel CLI

```bash
# 安装 Vercel CLI
npm i -g vercel

# 登录
vercel login

# 部署
vercel --prod
```

### 3. 环境变量配置

在 Vercel Dashboard 设置以下环境变量:

```
QWEN_API_KEY=your_qwen_api_key
DEEPSEEK_API_KEY=your_deepseek_api_key
```

### 4. 域名配置（可选）

1. Vercel Dashboard → Settings → Domains
2. 添加自定义域名
3. 配置 DNS 记录

---

## 本地开发

```bash
# 安装依赖
npm install

# 复制环境变量
cp .env.example .env.local

# 运行开发服务器
npm run dev

# 构建
npm run build

# 生产环境运行
npm start
```

---

## 性能优化

### 图片优化

- 使用 Next.js Image 组件
- 启用懒加载
- 使用 WebP 格式

### 代码优化

- 启用 Tree Shaking
- 代码分割
- 按需加载组件

### 缓存策略

- 启用 SWR 缓存
- API 响应缓存
- 静态资源 CDN

---

## 监控

### Vercel Analytics

```bash
npm i @vercel/analytics
```

在 `layout.tsx` 中添加:

```tsx
import { Analytics } from '@vercel/analytics/react';

<Analytics />
```

### 错误监控

推荐使用 Sentry:

```bash
npm i @sentry/nextjs
```

---

## CI/CD

Vercel 自动部署:

- Push to main → Production
- Pull Request → Preview

---

*2026-03-15 创建*
