# 🔷 Vercel 部署指南

**GitHub 仓库已推送成功！** ✅

---

## ✅ 已完成

- ✅ 代码已推送到 GitHub
- ✅ 仓库地址：https://github.com/clawbotai/memo-flow
- ✅ 所有文件完整

---

## 🎯 Vercel 部署步骤

### 方式一：Vercel Web 界面（推荐）

1. **访问**: https://vercel.com/new

2. **Import Git Repository**
   - 点击 "Import Git Repository"
   - 选择 **clawbotai/memo-flow** 仓库
   - 点击 "Import"

3. **配置项目**
   - Framework Preset: **Next.js**
   - Root Directory: `./` (默认)
   - Build Command: `npm run build` (默认)
   - Output Directory: `.next` (默认)

4. **设置环境变量**（重要！）
   
   点击 "Environment Variables" → "Add New":
   ```
   QWEN_API_KEY=sk-xxxxxxxxxx
   DEEPSEEK_API_KEY=sk-xxxxxxxxxx
   ```

   **获取 API Key**:
   - Qwen: https://dashscope.console.aliyun.com/apiKey
   - DeepSeek: https://platform.deepseek.com/api_keys

5. **点击 "Deploy"**

等待 2-3 分钟，部署完成！

---

### 方式二：Vercel CLI

```bash
# 1. 登录 Vercel
vercel login

# 选择登录方式：
# - GitHub (推荐)
# - Email
# - GitLab
# - Bitbucket

# 2. 部署
cd ~/claw/project/memoai
vercel --prod

# 按提示操作：
# - Set up and deploy? [Y]
# - Which scope? (选择你的账号)
# - Link to existing project? [N]
# - Project name? memo-flow
# - Directory? ./
# - Override settings? [N]

# 3. 设置环境变量
vercel env add QWEN_API_KEY production
vercel env add DEEPSEEK_API_KEY production

# 4. 重新部署
vercel --prod
```

---

## 🌐 部署完成后

### 访问链接

Vercel 会提供两个域名：

1. **生产域名**: `https://memo-flow-xxx.vercel.app`
2. **自定义域名**: (可选) `https://memoflow.app`

### 测试功能

- [ ] 首页可以访问
- [ ] 链接输入框正常
- [ ] 分析按钮可点击
- [ ] Toast 提示显示
- [ ] 页面切换流畅
- [ ] 移动端适配正常

---

## 🔧 故障排查

### 构建失败

**错误**: `Error: Build failed`

**解决**:
1. 查看 Vercel 部署日志
2. 本地构建测试：`npm run build`
3. 检查 TypeScript 错误：`npx tsc --noEmit`

### API 错误

**错误**: `API Key not found`

**解决**:
1. Vercel Dashboard → Settings → Environment Variables
2. 确认 `QWEN_API_KEY` 和 `DEEPSEEK_API_KEY` 已添加
3. 重新部署：`vercel --prod`

### 页面空白

**解决**:
1. 打开浏览器控制台查看错误
2. 查看 Vercel 函数日志
3. 检查 `next.config.ts` 配置

---

## 📱 分享部署效果

部署完成后，分享以下信息：

1. **Vercel 链接**: `https://memo-flow-xxx.vercel.app`
2. **GitHub 仓库**: `https://github.com/clawbotai/memo-flow`
3. **截图**: 首页、分析页、笔记页、知识库

---

## 🎯 快速检查清单

部署前确认：
- [x] GitHub 仓库已创建
- [x] 代码已推送
- [ ] Vercel 已登录
- [ ] API Keys 已获取
- [ ] 环境变量已设置

部署后确认：
- [ ] 部署成功
- [ ] 页面可以访问
- [ ] 功能正常
- [ ] 移动端适配正常

---

*Vercel 部署指南 v1.0 - 2026-03-16*

**MemoFlow - Let Your Ideas Flow** 🌊
