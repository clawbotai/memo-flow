# 🚀 MemoFlow - 部署指南

## 📋 部署步骤

### 1. 创建 GitHub 仓库

**方式一：GitHub Web 界面**

1. 访问 https://github.com/new
2. 仓库名称：`memoflow` 或 `memo-flow`
3. 可见性：**Public** 或 **Private**
4. **不要** 初始化 README/.gitignore（我们已经有）
5. 点击 "Create repository"

**方式二：GitHub CLI**

```bash
# 安装 GitHub CLI（如果没有）
brew install gh  # macOS
# 或
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
sudo apt-get update && sudo apt-get install gh  # Linux

# 登录
gh auth login

# 创建仓库
gh repo create memoflow --public --source=. --remote=origin --push
```

---

### 2. 推送代码到 GitHub

```bash
cd ~/claw/project/memoai

# 添加远程仓库（替换 YOUR_USERNAME 为你的 GitHub 用户名）
git remote add origin https://github.com/YOUR_USERNAME/memoflow.git

# 推送代码
git branch -M main
git push -u origin main
```

**验证推送**:
```bash
git remote -v
# 应该显示：
# origin  https://github.com/YOUR_USERNAME/memoflow.git (fetch)
# origin  https://github.com/YOUR_USERNAME/memoflow.git (push)

git push origin main
```

---

### 3. Vercel 部署

**方式一：Vercel Web 界面（推荐）**

1. 访问 https://vercel.com/new
2. 点击 "Import Git Repository"
3. 选择刚才创建的 `memoflow` 仓库
4. 点击 "Import"

**配置项目**:
- Framework Preset: **Next.js**
- Root Directory: `./` (默认)
- Build Command: `npm run build` (默认)
- Output Directory: `.next` (默认)

**环境变量**（重要！）:
```
QWEN_API_KEY=your_qwen_api_key
DEEPSEEK_API_KEY=your_deepseek_api_key
```

获取 API Key:
- Qwen: https://dashscope.console.aliyun.com/apiKey
- DeepSeek: https://platform.deepseek.com/api_keys

5. 点击 "Deploy"

---

**方式二：Vercel CLI**

```bash
# 安装 Vercel CLI
npm i -g vercel

# 登录 Vercel
vercel login

# 部署（首次）
cd ~/claw/project/memoai
vercel

# 按提示操作：
# - Set up and deploy? [Y]
# - Which scope? (选择你的账号)
# - Link to existing project? [N]
# - Project name? memoflow
# - Directory? ./
# - Override settings? [N]

# 设置环境变量
vercel env add QWEN_API_KEY
vercel env add DEEPSEEK_API_KEY

# 生产环境部署
vercel --prod
```

---

### 4. 查看部署效果

**Vercel 会提供两个域名**:
- 主域名：`memoflow.vercel.app`
- 预览域名：`memoflow-git-main-xxx.vercel.app`

**访问测试**:
1. 打开 `https://memoflow.vercel.app`
2. 测试首页链接输入
3. 测试分析功能
4. 测试笔记编辑
5. 测试知识库

---

## 🔧 故障排查

### 构建失败

**错误**: `Error: Build failed`

**解决**:
```bash
# 本地构建测试
cd ~/claw/project/memoai
npm run build

# 查看错误详情
npm run build 2>&1 | tee build.log
```

**常见问题**:
1. **TypeScript 错误**: `tsc --noEmit` 检查类型错误
2. **依赖缺失**: `npm install` 重新安装
3. **内存不足**: `NODE_OPTIONS="--max-old-space-size=4096" npm run build`

---

### API 错误

**错误**: `API Key not found`

**解决**:
1. Vercel Dashboard → Settings → Environment Variables
2. 添加 `QWEN_API_KEY` 和 `DEEPSEEK_API_KEY`
3. 重新部署：`vercel --prod`

---

### 页面空白

**错误**: 部署后页面空白

**解决**:
```bash
# 检查浏览器控制台错误
# 查看 Vercel 函数日志
vercel logs memoflow.vercel.app

# 检查 Next.js 配置
cat next.config.ts
```

---

## 📊 部署后检查清单

### 功能测试
- [ ] 首页可以访问
- [ ] 链接输入框正常
- [ ] 分析按钮可点击
- [ ] Toast 提示显示
- [ ] 页面切换流畅
- [ ] 移动端适配正常

### 性能测试
- [ ] 首屏加载 < 3 秒
- [ ] 动画流畅 60fps
- [ ] 无控制台错误
- [ ] Lighthouse 评分 80+

### SEO 检查
- [ ] 页面标题正确
- [ ] Meta 描述完整
- [ ] favicon 显示
- [ ] OpenGraph 标签

---

## 🎯 快速部署脚本

```bash
#!/bin/bash
# deploy.sh

set -e

echo "🚀 开始部署 MemoFlow..."

# 1. 检查 Git 状态
echo "📊 检查 Git 状态..."
git status

# 2. 提交更改
echo "💾 提交更改..."
git add -A
git commit -m "chore: 准备部署" || echo "无更改"

# 3. 推送到 GitHub
echo "📤 推送到 GitHub..."
git push origin main

# 4. 部署到 Vercel
echo "🔷 部署到 Vercel..."
vercel --prod

echo "✅ 部署完成！"
echo "🌐 访问：https://memoflow.vercel.app"
```

使用:
```bash
chmod +x deploy.sh
./deploy.sh
```

---

## 📱 分享部署效果

**部署完成后，分享以下信息**:

1. **Vercel 链接**: `https://memoflow.vercel.app`
2. **GitHub 仓库**: `https://github.com/YOUR_USERNAME/memoflow`
3. **截图**: 首页、分析页、笔记页、知识库

---

*部署指南 v1.0 - 2026-03-16*

**MemoFlow - Let Your Ideas Flow** 🌊
