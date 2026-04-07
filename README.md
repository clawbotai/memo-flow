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

## 本机 Helper

部署到 Vercel 后，浏览器本身不能直接读取用户电脑上的 `whisper.cpp`、`ffmpeg`、模型文件和输出目录。

本项目通过本机 helper 处理所有本地转录能力：

```bash
npm run helper
```

- 默认监听：`http://127.0.0.1:47392`
- macOS 数据目录：`~/Library/Application Support/MemoFlow/`
- Windows 数据目录：`%APPDATA%/MemoFlow/`
- 开发环境可覆盖数据目录：`MEMOFLOW_HELPER_DATA_DIR=/tmp/memo-flow-helper-data npm run helper`

前端中的 `Whisper 设置`、转录历史、实时进度、重转录和删除操作，都会通过这个本机 helper 访问用户电脑上的本地环境。
