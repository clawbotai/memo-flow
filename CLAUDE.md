# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

**Linksy** (产品名 MemoFlow) 是一个 Tauri v2 桌面应用，用于播客转录和本地 LLM 内容生成。前端为 React + Vite，后端为 Node.js HTTP 侧车进程，通过 Tauri Rust shell 管理生命周期。

当前分支 `desktop` 只保留桌面端运行链路，`src/app/` 下的 Next.js 路由目录为历史遗留，可忽略。

## 开发命令

```bash
# 开发模式（构建 helper 侧车 + 启动 Tauri dev）
npm run dev            # 等同于 npm run desktop:dev

# 单独启动 helper 服务（调试后端）
npm run helper         # node helper/server.js，监听 127.0.0.1:47392

# 构建生产版本
npm run build          # 等同于 npm run desktop:build

# TypeScript 类型检查
npm run typecheck      # tsc --noEmit

# 手动构建 helper 侧车二进制
npm run desktop:helper:build

# Vite 开发服务器（不通过 Tauri）
npm run desktop:web:dev     # 端口 1420
npm run desktop:web:build   # 输出到 dist-desktop/
```

**无测试框架、无 ESLint/Prettier 配置。** 唯一的代码质量检查是 `npm run typecheck`。

## 目录结构

```
desktop/                  # 桌面端前端（活跃开发目录）
  src/
    main.tsx              # React 入口
    App.tsx               # HashRouter + 4 条路由
    components/           # 桌面专属组件（侧边栏、顶栏、页面容器）
    pages/                # 页面组件

src/                      # 共享代码（桌面端通过 @/ 别名引用）
  components/ui/          # shadcn/ui 风格组件
  components/app-settings/        # 设置面板
  components/language-model/      # LLM 提供商配置 UI
  components/transcription-mindmap/  # 思维导图
  lib/                    # 工具函数、HTTP 客户端、缓存、类型定义
  hooks/                  # React hooks
  styles/globals.css      # Tailwind + HSL 自定义主题
  types/                  # TypeScript 类型定义

helper/                   # Node.js 侧车服务器（后端）
  server.js               # 入口，监听 127.0.0.1:47392
  lib/
    http-handler.js       # 路由分发（所有 API 端点）
    transcription.js      # 转录编排器
    transcription/        # 转录子模块（whisper、qwen-asr、内容生成等）
    runtime/              # 运行时检测与安装
    config.js             # 配置读写
    history.js            # 转录历史 CRUD + SSE 推送
    cors-sse.js           # CORS + SSE 工具

src-tauri/                # Tauri Rust shell
  tauri.conf.json         # 产品名 "Linksy"、端口、侧车配置
  src/lib.rs              # 启动 helper、等待 /health、管理生命周期
```

## 路径别名

- `@/` → `src/`（共享代码）
- `@desktop/` → `desktop/src/`（桌面专属代码）

## 架构模式

### 侧车（Sidecar）后端
Tauri Rust 代码将 Node.js helper 打包为独立二进制并作为侧车进程启动。Rust 侧轮询 `/health` 端点直到响应后再显示主窗口。所有后端能力（转录、历史、思维导图、内容生成、LLM 调用）均通过此本地 HTTP 服务器实现，**不通过 Tauri 命令**。

前端通过 `src/lib/local-helper-client.ts` 发起 HTTP 请求和 EventSource SSE 连接。

### 路由结构（Hash Router）
- `/` — 首页仪表板
- `/podcast` — 播客转录主工作流
- `/transcriptions` — 历史记录列表
- `/transcriptions/:id` — 转录详情（含标签页：转录文本、思维导图、内容生成）

### 数据持久化
Helper 侧将数据以 JSON/文本文件形式存储在平台应用数据目录（macOS: `~/Library/Application Support/MemoFlow/`）。转录输出包括 `纯文本.txt`、`逐字稿.txt`、`思维导图.json`、`content-points.json`、`content-drafts.json`。**不使用数据库。**

### 实时通信
转录进度、模型下载进度、运行时安装进度均使用 SSE（Server-Sent Events），前端具备重连逻辑。

### 内容生成工作流
两阶段流水线：
1. **观点提取** — LLM 分析转录文本提取关键观点
2. **平台内容生成** — 将选定观点转为平台专属草稿（当前仅支持"小红书"）

需在 `src/lib/language-models.ts` 中配置 LLM 提供商（providerId + modelId）。

## 技术栈

| 领域 | 技术 |
|------|------|
| UI 框架 | React 18 + Vite 6 |
| 路由 | react-router-dom v6 (createHashRouter) |
| 样式 | TailwindCSS 3 + HSL 自定义属性（自然生物主题配色） |
| UI 组件 | shadcn/ui 风格（Radix primitives + clsx + tailwind-merge） |
| 图标 | lucide-react |
| 主题 | next-themes（暗色/亮色切换） |
| 思维导图 | simple-mind-map |
| 桌面壳 | Tauri v2 + tauri-plugin-shell |
| 后端 | 原生 Node.js HTTP 服务器（无 Express） |
| 打包 | pkg（将 helper 打包为独立可执行文件） |

## 编码规范

详见 `.claude/rules/00-中文回复规则.md`：
- 所有回复、代码注释、commit message 使用简体中文
- 技术术语保留英文，括号注明中文
- 变量名和函数名使用英文
- 错误提示信息使用中文

## 重要约定

- **不要修改 `src/app/` 目录** — 这是 Next.js 历史遗留，当前不活跃
- **所有 API 调用走 helper HTTP 服务** — 不要尝试通过 Tauri 命令调用后端功能
- **UI 字符串使用中文** — 所有面向用户的文本、标签、错误提示均为简体中文
- **HSL 颜色系统** — 样式使用 `hsl(var(--primary))` 等 CSS 变量，而非硬编码颜色值
