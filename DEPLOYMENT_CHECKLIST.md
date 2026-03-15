# 🚀 MemoFlow 部署检查清单

## 部署前检查

### 1. 代码检查
- [x] 所有页面完成
- [x] API 路由正常
- [x] 组件无报错
- [x] TypeScript 类型正确

### 2. 环境配置
- [ ] 创建 GitHub 仓库
- [ ] 推送代码到 GitHub
- [ ] 配置 Vercel 项目
- [ ] 设置环境变量

### 3. 环境变量
需要配置以下环境变量：

```
QWEN_API_KEY=your_qwen_api_key
DEEPSEEK_API_KEY=your_deepseek_api_key
```

获取 API Key:
- Qwen: https://dashscope.console.aliyun.com/
- DeepSeek: https://platform.deepseek.com/

## 部署步骤

### 方式一：Vercel Dashboard（推荐）

1. 访问 https://vercel.com/new
2. 点击 "Import Git Repository"
3. 选择 memoai 仓库
4. 配置环境变量
5. 点击 "Deploy"

### 方式二：Vercel CLI

```bash
# 安装 Vercel CLI
npm i -g vercel

# 登录
vercel login

# 部署
cd ~/claw/project/memoai
vercel --prod
```

## 部署后检查

### 功能测试
- [ ] 首页链接输入
- [ ] YouTube 链接解析
- [ ] 分析结果展示
- [ ] 笔记生成
- [ ] 知识库浏览

### 性能检查
- [ ] 首屏加载 < 2s
- [ ] 页面切换流畅
- [ ] 移动端适配

### SEO 检查
- [ ] 页面标题正确
- [ ] 描述完整
- [ ] 结构化数据

## 故障排查

### 构建失败
```bash
# 本地构建测试
npm run build
```

### API 错误
- 检查环境变量是否配置
- 检查 API Key 是否有效
- 查看 Vercel 函数日志

### 样式问题
- 清除浏览器缓存
- 检查 Tailwind 配置
- 重新构建部署

## 后续优化

1. 接入真实 AI API
2. 添加用户认证
3. 数据库集成
4. 性能监控
5. 错误追踪

---

*2026-03-15 创建*
