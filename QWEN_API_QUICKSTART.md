# 🤖 Qwen API 集成指南

## 📋 快速开始

### 1. 获取 API Key

1. **访问**: https://dashscope.console.aliyun.com/apiKey
2. **登录/注册**: 阿里云账号
3. **创建 API Key**: 复制 Key（格式：`sk-xxxxxxxxxx`）
4. **开通服务**: 确保开通"通义千问"服务

### 2. 配置环境变量

**本地开发**:
```bash
cd ~/claw/project/memoai
cp .env.example .env.local
```

编辑 `.env.local`:
```bash
QWEN_API_KEY=sk-your-api-key-here
```

**Vercel 部署**:
1. Settings → Environment Variables
2. 添加 `QWEN_API_KEY`
3. 重新部署

### 3. 测试

```bash
npm run dev
# 访问首页，粘贴链接测试
```

---

## 💰 费用说明

**qwen-turbo**（推荐）:
- 输入：¥0.002/1K tokens
- 输出：¥0.006/1K tokens
- 免费额度：100 万 tokens/月

**单次分析**（1000 字）: 约 ¥0.006  
**每月 100 次**: 约 ¥0.6（免费额度内）

---

## ⚠️ 错误处理

- 自动重试 3 次
- 指数退避（1s, 2s, 4s）
- 失败后使用模拟数据

---

*完整文档：docs/QWEN_API_GUIDE.md*
