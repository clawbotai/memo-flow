# MemoFlow Desktop

当前分支只保留桌面端运行链路：

- `desktop/`：Vite + React 桌面前端
- `src-tauri/`：Tauri 宿主与打包配置
- `helper/server.js`：本机转录 helper，负责模型、音频处理和历史记录
- `src/`：桌面端复用的共享组件、hooks、样式和类型

## 开发

```bash
npm run desktop:dev
```

## 构建

```bash
npm run desktop:build
```

桌面端打包前会自动执行：

- `npm run desktop:helper:build`
- `npm run desktop:web:build`

## 本机 Helper

桌面端所有本地转录能力都通过本机 helper 处理：

```bash
npm run helper
```

- 默认监听：`http://127.0.0.1:47392`
- macOS 数据目录：`~/Library/Application Support/MemoFlow/`
- Windows 数据目录：`%APPDATA%/MemoFlow/`
- 开发环境可覆盖数据目录：`MEMOFLOW_HELPER_DATA_DIR=/tmp/memo-flow-helper-data npm run helper`

前端中的 `Whisper 设置`、转录历史、实时进度、重转录和删除操作，都会通过这个本机 helper 访问本地环境。
