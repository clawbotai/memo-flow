# 🚀 MemoFlow - 快速部署步骤

**老板，按下面步骤操作，5 分钟完成部署！**

---

## 步骤 1: 创建 GitHub 仓库 (1 分钟)

1. 访问：https://github.com/new
2. 仓库名：`memo-flow`
3. 可见性：**Public**
4. **不要** 勾选 "Add a README file"
5. 点击 "Create repository"

---

## 步骤 2: 推送代码 (1 分钟)

**复制仓库地址**，然后运行：

```bash
cd ~/claw/project/memoai

# 如果之前添加过错误的 remote，先删除
git remote remove origin 2>/dev/null || true

# 添加正确的 remote（替换为你的仓库地址）
git remote add origin https://github.com/keepcodinglife/memo-flow.git

# 推送
git push -u origin main
```

---

## 步骤 3: Vercel 部署 (3 分钟)

1. 访问：https://vercel.com/new
2. 点击 **"Import Git Repository"**
3. 选择 **memo-flow** 仓库
4. 点击 **"Import"**

**配置环境变量**（重要！）:
```
QWEN_API_KEY=sk-xxxxx  (从 https://dashscope.console.aliyun.com/apiKey 获取)
DEEPSEEK_API_KEY=xxxxx  (从 https://platform.deepseek.com/api_keys 获取)
```

5. 点击 **"Deploy"**

等待 2-3 分钟，部署完成！

---

## 步骤 4: 查看效果

部署完成后，Vercel 会显示：
- ✅ **Deployment Ready**
- 🌐 **Production**: `https://memo-flow.vercel.app`

点击链接访问！

---

## 🎯 一键部署脚本

如果你想自动化，创建这个脚本：

```bash
#!/bin/bash
# quick-deploy.sh

echo "🚀 开始部署 MemoFlow..."

# 1. 推送到 GitHub
echo "📤 推送到 GitHub..."
cd ~/claw/project/memoai
git remote remove origin 2>/dev/null || true
git remote add origin https://github.com/keepcodinglife/memo-flow.git
git push -u origin main

# 2. 部署到 Vercel
echo "🔷 部署到 Vercel..."
vercel deploy --prod --yes

echo "✅ 部署完成！"
echo "🌐 访问：https://memo-flow.vercel.app"
```

使用:
```bash
chmod +x quick-deploy.sh
./quick-deploy.sh
```

---

## 📱 完成后分享

部署完成后，分享链接给我：
- **Vercel 链接**: `https://memo-flow.vercel.app`
- **GitHub 仓库**: `https://github.com/keepcodinglife/memo-flow`

---

*快速部署指南 v1.0 - 2026-03-16*

**MemoFlow - Let Your Ideas Flow** 🌊
