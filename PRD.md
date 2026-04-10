# MemoFlow 内容生成功能 PRD

## 1. 文档信息

- 项目名称：MemoFlow
- 功能名称：内容生成 V1
- 文档状态：正式版
- 适用范围：桌面端转录详情页内的内容生成能力
- 更新时间：2026-04-09

## 2. 背景与目标

### 2.1 背景

MemoFlow 当前已经具备以下基础能力：

- 音频链接或文件输入
- 本地转录与逐字稿保存
- 转录详情页查看
- 思维导图生成
- 本地历史记录与结果持久化

现阶段用户在完成转录后，仍需要自行从逐字稿中提炼观点、整理结构、改写文案并适配不同平台。这个过程重复、耗时、且质量不稳定。

因此需要在当前项目中增加“内容生成”能力，让用户可以直接在转录详情页内，基于转录内容生成适用于自媒体平台的初稿。

### 2.2 产品目标

内容生成 V1 的目标是：

- 让用户在转录完成后，快速得到可发布的内容初稿
- 保证生成过程可控、可追溯、可编辑
- 将内容生成结果绑定到当前转录记录并持久化保存
- 在现有项目结构中落地，不引入过重的新流程

### 2.3 V1 核心原则

- 内容生成是转录完成后的下游能力，不是独立产品入口
- 先解决“可用”和“可控”，后续再扩展“爆款化”和“自动优化”
- 每条结果必须能回溯到其来源观点
- 用户手动编辑后的内容不能被系统静默覆盖

## 3. 版本策略

### 3.1 V1 定位

V1 只实现两段式流程：

1. 观点提炼
2. 平台内容生成

V1 不实现完整多段 Prompt Pipeline，不单独实现“内容理解”“爆款加工”“去 AI 味”三个独立步骤。

### 3.2 后续版本方向

- V1.1：增强小红书模板、补充标题与标签优化
- V2：支持微信公众号长文
- V2.1：支持爆款加工模式
- V3：支持风格切换、领域视角切换、自动优化

## 4. 目标用户与使用场景

### 4.1 目标用户

- 播客内容创作者
- 自媒体运营者
- 知识型内容输出者
- 需要将音频内容快速改写为社交平台文案的用户

### 4.2 典型场景

- 用户导入播客链接并完成转录后，希望快速生成小红书文案初稿
- 用户上传音频并完成转录后，希望生成小红书笔记
- 用户希望从完整逐字稿中选取部分观点，组合成更可传播的文案
- 用户希望在 AI 生成结果基础上继续手动编辑并保存

## 5. 功能范围

### 5.1 V1 范围内

- 在转录详情页增加“内容生成”Tab
- 基于 transcript 提炼可传播观点
- 支持用户勾选观点作为生成依据
- 支持生成 Twitter/X Thread
- 支持生成小红书正文初稿
- 支持复制、编辑、保存、重写
- 支持结果持久化
- 支持状态管理、错误提示、失败重试

### 5.2 V1 范围外

- 微信公众号长文生成
- 自动爆款加工
- 独立“去 AI 味”步骤
- 多轮 Agent 自主优化
- 平台一键发布
- 团队协作与审核流

## 6. 产品方案

### 6.1 入口与位置

内容生成能力集成在现有转录详情页中，与现有页签并列展示。

建议页签结构：

- 转录逐字稿
- 内容生成
- 思维导图

现有“总结”预留页签可直接替换为“内容生成”。

### 6.2 用户流程

1. 用户完成转录
2. 打开转录详情页
3. 切换到“内容生成”Tab
4. 选择模型与目标平台
5. 点击“提炼观点”
6. 查看观点结果并进行勾选
7. 点击“生成内容”
8. 查看结果，支持复制、编辑、保存、重写
9. 结果与当前转录记录绑定保存

### 6.3 页面结构

内容生成 Tab 建议采用左右布局：

- 左侧：观点提炼区
- 右侧：生成结果区

页面主要区域：

1. 顶部操作区
- 模型选择
- 平台选择
- 提炼观点按钮
- 生成内容按钮

2. 观点提炼区
- 主题
- 传播观点
- 争议观点
- 金句
- 每条观点支持勾选
- 每条观点支持来源片段展示

3. 生成结果区
- 平台内容卡片
- 复制按钮
- 编辑按钮
- 保存按钮
- 重写按钮
- 过期状态提示

## 7. 核心功能需求

### 7.1 观点提炼

系统基于当前转录记录的 transcript 提炼结构化观点，输出内容包含：

- 主题
- 传播观点列表
- 争议观点列表
- 金句列表
- 每条观点的来源片段或时间戳

要求：

- 支持单独触发
- 支持失败后重试
- 支持结果持久化
- 支持用户勾选观点作为后续生成输入

### 7.2 平台内容生成

系统基于用户勾选的观点生成平台内容。

V1 支持平台：

- Twitter/X Thread
- 小红书正文

要求：

- Twitter/X 输出为 thread 结构
- 小红书输出为标题加正文结构
- 每条输出记录应保存其依赖的观点 ID
- 同一转录记录下支持按平台分别生成
- 支持单独重写当前平台内容

### 7.3 结果编辑与保存

用户可以对生成结果进行手动修改并保存。

要求：

- 支持编辑状态切换
- 支持手动保存
- 已手动编辑的结果不可被自动生成静默覆盖
- 重写时应生成新版本或明确替换逻辑

### 7.4 可追溯性

所有生成结果需具备可追溯能力。

至少包含以下信息：

- 当前结果使用了哪些观点
- 每条观点来源于哪些 transcript 片段
- 当前结果所属平台
- 当前结果生成时间
- 当前结果是否被用户手动编辑过

### 7.5 状态与失效管理

当观点提炼结果被重新生成或修改后，依赖旧观点的内容结果需要被标记为过期。

规则：

- 上游观点变化后，下游内容状态为 `stale`
- 用户可继续查看旧结果
- 用户可基于新观点重新生成
- 不自动清空用户编辑内容

## 8. 平台输出约束

### 8.1 小红书（Phase 1 优先）

输出要求：

- 包含 1 个标题（20 字以内，可使用 emoji）
- 包含 1 段到多段正文（500-800 字）
- 风格更口语化、可读性更强
- 允许适度加入分段、符号、轻量情绪表达
- 不允许脱离原文信息进行强夸张改写
- 包含 3-5 个相关标签

### 8.2 Twitter/X Thread（Phase 2）

输出要求：

- 包含 4 到 8 条内容
- 第 1 条必须具备 Hook 能力
- 内容整体简洁、有连续性
- 每条控制在 280 字符以内（中文约 140 字）
- 结尾可以包含轻量 CTA，但不强制
- 文案应尽量保留原观点，不编造原文中不存在的事实

## 9. 功能边界与策略说明

### 9.1 关于“内容理解”

V1 不单独暴露“内容理解”步骤。其能力可内嵌在观点提炼 Prompt 中完成。

### 9.2 关于“爆款加工”

V1 不做独立爆款加工层，避免链路过长、质量失控。后续版本可将其作为可选模式追加。

### 9.3 关于“去 AI 味”

V1 不做独立去 AI 味节点。自然表达要求直接并入平台生成 Prompt 中。

## 10. 数据结构设计

### 10.1 转录记录扩展字段

建议在转录记录中增加以下状态字段：

- `pointExtractionStatus`
- `pointExtractionUpdatedAt`
- `pointExtractionError`
- `contentGenerationStatus`
- `contentGenerationUpdatedAt`
- `contentGenerationError`

### 10.2 观点数据结构

建议结构：

```ts
interface GeneratedPoint {
  id: string;
  type: 'theme' | 'viral' | 'controversial' | 'quote';
  text: string;
  sourceText?: string;
  sourceTimestamp?: string;
  selected?: boolean;
}

interface PointExtractionResult {
  theme?: string;
  points: GeneratedPoint[];
  updatedAt: string;
}
```

### 10.3 内容草稿数据结构

建议结构：

```ts
interface GeneratedContentDraft {
  id: string;
  platform: 'redbook' | 'twitter';  // redbook 是 Phase 1 优先
  title?: string;                   // 小红书标题
  content: string;                  // 小红书正文 / Twitter 拼接内容
  tweets?: string[];                // Twitter 专用：推文数组
  tags?: string[];                  // 小红书专用：标签
  sourcePointIds: string[];         // 依赖的观点 ID 列表
  version: number;
  editedByUser: boolean;
  status: 'ready' | 'error' | 'stale';
  createdAt: string;
  updatedAt: string;
}
```

## 11. 本地持久化方案

内容生成结果与当前转录记录绑定，保存在该记录对应的本地目录下。

### 11.1 文件命名规范

建议新增文件（统一使用英文文件名）：

- `content-points.json` —— 观点提炼结果
- `content-drafts.json` —— 平台内容草稿

### 11.2 目录结构

```
{savedPath}/
├── transcript.json      # 转录原文（已有）
├── mindmap.json         # 思维导图（已有）
├── content-points.json  # 观点提炼结果（新增）
└── content-drafts.json  # 平台内容草稿（新增）
```

### 11.3 存储原则

- 观点提炼结果单独保存在 `content-points.json`
- 不同平台草稿统一保存在 `content-drafts.json`，按 platform 字段区分
- 保留最近一次生成结果（V1 不做版本历史）
- 用户手动编辑并保存后，`editedByUser` 字段标记为 `true`

## 12. 接口设计

### 12.0 统一响应格式

所有接口响应遵循以下格式：

**成功响应：**
```json
{
  "success": true,
  "data": { ... }
}
```

**错误响应：**
```json
{
  "success": false,
  "error": "错误信息",
  "code": "ERROR_CODE"
}
```

**常见错误码：**
- `TRANSCRIPT_NOT_COMPLETED` —— 转录未完成
- `PROVIDER_NOT_CONFIGURED` —— 语言模型未配置
- `POINTS_NOT_SELECTED` —— 未选择观点
- `GENERATION_FAILED` —— 生成失败
- `TIMEOUT` —— 请求超时

### 12.1 观点提炼接口

`POST /transcriptions/:id/content-points/generate`

请求参数：

- `provider`

响应内容：

- 观点提炼结果
- 当前状态

### 12.2 获取观点接口

`GET /transcriptions/:id/content-points`

### 12.3 内容生成接口

`POST /transcriptions/:id/content/generate`

请求参数：

- `provider`
- `platform`
- `selectedPointIds`

响应内容：

- 当前平台生成结果
- 当前状态

### 12.4 获取内容接口

`GET /transcriptions/:id/content`

### 12.5 保存内容接口

`POST /transcriptions/:id/content/save`

请求参数：

- `platform`
- `draft`

### 12.6 重写内容接口

`POST /transcriptions/:id/content/regenerate`

请求参数：

- `provider`
- `platform`
- `selectedPointIds`

## 13. Prompt 策略

V1 仅保留三类 Prompt：

1. 观点提炼 Prompt
2. 小红书生成 Prompt（Phase 1 优先）
3. Twitter/X 生成 Prompt（Phase 2）

Prompt 原则：

- 优先忠实原文，不编造信息
- 输出结构必须稳定、可解析
- 输出文案要自然，但不过度修饰
- 支持从长文本中抽取高密度信息

### 13.1 观点提炼 Prompt 模板

```
你是一个内容分析专家。请分析以下播客/视频转录内容，提取可传播的观点。

转录标题：{title}

转录内容：
{transcript}

请按以下 JSON 格式返回（只返回 JSON，不要输出其他解释内容）：

{
  "theme": "用一句话概括核心主题",
  "viralPoints": [
    {
      "text": "易于传播的观点 1",
      "sourceText": "对应的原文片段",
      "sourceTimestamp": "时间戳（如 02:34）"
    }
  ],
  "controversialPoints": [
    {
      "text": "有争议/反常识的观点 1",
      "sourceText": "对应的原文片段",
      "sourceTimestamp": "时间戳（如 05:12）"
    }
  ],
  "quotes": [
    {
      "text": "金句 1",
      "sourceText": "对应的原文片段",
      "sourceTimestamp": "时间戳（如 08:45）"
    }
  ]
}

要求：
1. 所有观点必须来源于原文，不编造原文中不存在的信息
2. 每条观点必须附带来源片段和时间戳
3. viralPoints 应该是易于理解和转述的观点
4. controversialPoints 应该是具有反常识或讨论性的观点
5. quotes 应该是表达精炼、适合直接引用的句子
6. 每个类别的观点数量控制在 3-8 条
```

### 13.2 小红书生成 Prompt 模板（Phase 1 优先）

```
你是一个小红书内容创作专家。请根据用户选择的观点，生成一篇小红书笔记。

用户选择的观点：
{selectedPoints}

转录标题：{title}

请按以下 JSON 格式返回（只返回 JSON，不要输出其他解释内容）：

{
  "title": "吸引人的标题（20 字以内，可使用 emoji）",
  "content": "正文内容（500-800 字，可分段）",
  "tags": ["标签 1", "标签 2", "标签 3"]
}

要求：
1. 标题要有吸引力，可使用 emoji 和悬念表达
2. 正文 500-800 字，可分 3-5 段
3. 风格口语化、有情绪感染力
4. 适度使用 emoji（每段 1-2 个，不要过多）
5. 允许适度加入分段符号、轻量情绪表达
6. 不允许脱离原文信息进行强夸张改写
7. 标签 3-5 个，与内容主题相关
8. 语言自然，避免 AI 痕迹
```

### 13.3 Twitter/X 生成 Prompt 模板（Phase 2）

```
你是一个 Twitter/X 内容创作专家。请根据用户选择的观点，生成一条 Twitter Thread。

用户选择的观点：
{selectedPoints}

转录标题：{title}

请按以下 JSON 格式返回（只返回 JSON，不要输出其他解释内容）：

{
  "tweets": [
    "第 1 条推文（必须有 Hook，吸引用户继续阅读）",
    "第 2 条推文（展开观点 1）",
    "第 3 条推文（展开观点 2）",
    "第 4 条推文（展开观点 3）",
    "第 5 条推文（总结或 CTA）"
  ]
}

要求：
1. 生成 4-8 条推文
2. 第 1 条必须有 Hook 能力（反常识、悬念、冲突）
3. 每条推文控制在 280 字符以内（中文约 140 字）
4. 内容要有连续性，每条之间有逻辑递进
5. 优先使用用户选择的观点，不编造原文中不存在的信息
6. 语言自然、口语化，避免 AI 痕迹
7. 结尾可以有轻量 CTA，但不强制
```

## 14. 非功能要求

### 14.1 性能

- 观点提炼和内容生成应支持超时控制（建议 90 秒）
- 对长转录文本应采取截断或分段策略（建议上限 18000 字）
- 结果读取应优先命中本地缓存

### 14.2 稳定性

- 任一步骤失败后都可重试
- 模型返回格式异常时应提示重试
- 本地文件缺失时可重新生成
- 当模型返回格式异常时，应有重试解析逻辑（如自动提取 JSON 块）
- 当模型超时或失败时，应保留上一次的中间结果
- 不同 Provider 的超时时间应统一（建议 90 秒）

### 14.3 可用性

- 转录未完成时不可生成内容
- 未选择观点时不可生成内容
- 模型未配置时应提示前往设置

### 14.4 边界情况处理

**观点勾选数量约束：**
- 用户未勾选任何观点时，"生成内容"按钮应禁用
- 用户勾选过少（如<2 条）时，应提示"建议至少选择 3 条观点"
- 用户勾选过多（如>8 条）时，应提示"建议选择最重要的 3-5 条"

**长文本处理：**
- 当转录内容超过 18000 字时，自动截断并提示"内容较长，已截取前 18000 字进行处理"
- 截断策略：优先保留前 80% + 随机采样后 20%

**模型降级策略：**
- 当首选 Provider 失败时，不自动切换到其他 Provider（避免结果不一致）
- 当模型返回非 JSON 格式时，尝试自动提取 JSON 代码块
- 当解析失败超过 3 次时，提示"模型返回格式异常，请重试或更换模型"

**网络异常处理：**
- 请求超时（90 秒）时提示"请求超时，请重试"
- 网络断开时提示"网络连接失败，请检查网络后重试"
- 服务端错误（5xx）时提示"服务暂时不可用，请稍后重试"

## 15. 埋点与评估指标

V1 重点观测以下指标：

### 15.1 过程指标

| 指标 | 定义 | 目标 |
|------|------|------|
| 观点提炼触发次数 | 用户点击"提炼观点"的次数 | - |
| 内容生成触发次数 | 用户点击"生成内容"的次数 | - |
| 生成成功率 | 成功生成次数 / 触发次数 | >85% |
| 平均重写次数 | 同一平台内容的平均重写次数 | <2 次 |
| 复制次数 | 用户点击"复制"按钮的次数 | - |
| 编辑后保存次数 | 用户编辑后点击"保存"的次数 | - |
| 不同平台生成后的放弃率 | 生成后未复制/未保存的比例 | <40% |

### 15.2 核心判断指标

| 行为 | 说明 | 应对措施 |
|------|------|------|
| 不复制 | 内容质量不行 | 优化 Prompt 或增加编辑引导 |
| 复制但不发 | 不够自然 | 强化"去 AI 味"能力 |
| 发了没互动 | 不够有观点 | 优化爆款加工能力（V2） |
| 频繁重写同一平台 | 生成结果不满意 | 提供风格选择或领域切换 |

### 15.3 埋点事件定义

```
// 观点提炼相关
- content_points_generate_start    // 开始生成观点
- content_points_generate_success  // 观点生成成功
- content_points_generate_error    // 观点生成失败
- content_points_select            // 用户勾选/取消勾选观点

// 内容生成相关
- content_generate_start           // 开始生成内容
- content_generate_success         // 内容生成成功
- content_generate_error           // 内容生成失败
- content_generate_retry           // 用户点击重写

// 用户行为相关
- content_copy                     // 用户点击复制
- content_edit_start               // 用户开始编辑
- content_edit_save                // 用户编辑后保存
- content_tab_open                 // 用户打开内容生成 Tab
```

## 16. 风险与约束

### 16.1 主要风险

| 风险 | 影响 | 控制策略 |
|------|------|------|
| 长文本直接生成导致质量不稳定 | 高 | 采用截断策略 + 分段处理（V2） |
| 为追求传播性而偏离原文含义 | 高 | Prompt 强调忠实原文 + 可追溯来源 |
| 用户编辑与系统重写之间的状态冲突 | 中 | 用 `editedByUser` 标记 + 覆盖前确认 |
| 多平台生成带来状态和缓存复杂度上升 | 中 | 用 `stale` 状态标记上下游依赖关系 |
| 模型返回格式不稳定 | 中 | JSON 自动提取 + 失败重试机制 |
| 用户期望过高导致失望 | 低 | 明确提示”生成的是初稿，建议编辑后发布” |

### 16.2 控制策略

- V1 收敛到两段式流程
- 保留来源片段，增强可追溯性
- 用 `stale` 状态标记上下游依赖关系
- 不将”爆款加工”设为默认步骤
- 在 UI 中明确提示”生成结果需人工校对后发布”

## 17. 研发实现建议

### 17.1 前端

- 在转录详情页新增”内容生成”Tab
- 新增观点提炼面板
- 新增观点勾选组件
- 新增平台选择组件
- 新增内容结果卡片
- 新增复制、编辑、保存、重写交互
- 新增过期状态展示

### 17.2 Helper

- 新增观点提炼逻辑模块
- 新增内容生成逻辑模块
- 新增本地持久化读写
- 新增接口路由
- 新增状态回写逻辑
- 复用现有 LLM Provider 配置与请求模式

### 17.3 建议新增模块

```
helper/lib/transcription/
├── content-points.js        # 观点提炼逻辑
├── content-generation.js    # 平台内容生成逻辑
└── content-prompts.js       # Prompt 模板管理
```

### 17.4 建议新增常量

在 `helper/lib/constants.js` 中新增：

```javascript
// 内容生成相关文件常量
const CONTENT_POINTS_FILE = 'content-points.json';
const CONTENT_DRAFTS_FILE = 'content-drafts.json';
```

### 17.5 模块职责划分

**content-points.js：**
- `extractContentPoints(record, provider)` —— 调用 LLM 提炼观点
- `saveContentPoints(savedPath, points)` —— 保存观点到本地
- `loadContentPoints(savedPath)` —— 从本地加载观点
- `buildExtractPrompt(transcript, title)` —— 构建观点提炼 Prompt

**content-generation.js：**
- `generatePlatformContent(selectedPoints, platform, provider)` —— 生成平台内容
- `saveContentDraft(savedPath, platform, draft)` —— 保存草稿到本地
- `loadContentDraft(savedPath, platform)` —— 从本地加载草稿
- `buildTwitterPrompt(selectedPoints, title)` —— 构建 Twitter Prompt
- `buildRedbookPrompt(selectedPoints, title)` —— 构建小红书 Prompt

**content-prompts.js：**
- 集中管理所有 Prompt 模板
- 支持 Prompt 版本管理（便于后续 A/B 测试）

## 18. 开发功能清单

### 18.1 前端功能

| 功能 | 说明 | 优先级 |
|------|------|--------|
| 内容生成 Tab | 替换现有"总结"预留页签 | P0 |
| 模型选择器 | 复用现有 LLM Provider 选择 | P0 |
| 平台选择器 | Twitter / 小红书切换 | P0 |
| 观点提炼按钮 | 触发观点生成 | P0 |
| 观点分类展示 | 主题 / 传播观点 / 争议观点 / 金句 | P0 |
| 观点勾选组件 | Checkbox + 来源片段展示 | P0 |
| 生成内容按钮 | 触发平台内容生成 | P0 |
| 结果卡片展示 | Twitter Thread / 小红书文案 | P0 |
| 复制功能 | 一键复制全部内容 | P0 |
| 编辑与保存功能 | Textarea 编辑 + 保存 | P0 |
| 重写功能 | 基于相同观点重新生成 | P1 |
| 错误态与空状态 | 引导用户操作 | P0 |
| 过期状态提示 | 观点变化后标记旧内容为 stale | P1 |
| 观点数量提示 | <2 条或>8 条时的引导提示 | P2 |

### 18.2 Helper 功能

| 功能 | 说明 | 优先级 |
|------|------|--------|
| `POST /transcriptions/:id/content-points/generate` | 观点提炼接口 | P0 |
| `GET /transcriptions/:id/content-points` | 获取观点接口 | P0 |
| `POST /transcriptions/:id/content/generate` | 内容生成接口 | P0 |
| `GET /transcriptions/:id/content` | 获取内容接口 | P0 |
| `POST /transcriptions/:id/content/save` | 保存内容接口 | P0 |
| `POST /transcriptions/:id/content/regenerate` | 重写内容接口 | P1 |
| 本地 JSON 持久化 | content-points.json / content-drafts.json | P0 |
| 状态字段更新 | 更新转录记录的状态字段 | P0 |
| Prompt 模板管理 | 集中管理 Prompt 模板 | P0 |
| 长文本处理 | 截断策略 + 提示 | P0 |
| JSON 自动提取 | 从非结构化响应中提取 JSON | P1 |

### 18.3 数据与类型

**扩展转录记录类型（TranscriptionRecord）：**
```typescript
pointExtractionStatus?: 'idle' | 'generating' | 'ready' | 'error';
pointExtractionUpdatedAt?: Date;
pointExtractionError?: string;
contentGenerationStatus?: 'idle' | 'generating' | 'ready' | 'error';
contentGenerationUpdatedAt?: Date;
contentGenerationError?: string;
```

**新增观点类型定义：**
```typescript
interface GeneratedPoint {
  id: string;
  type: 'theme' | 'viral' | 'controversial' | 'quote';
  text: string;
  sourceText?: string;
  sourceTimestamp?: string;
  selected?: boolean;
}

interface PointExtractionResult {
  theme?: string;
  points: GeneratedPoint[];
  updatedAt: string;
}
```

**新增平台草稿类型定义：**
```typescript
interface GeneratedContentDraft {
  id: string;
  platform: 'twitter' | 'redbook';
  title?: string;
  content: string;
  tweets?: string[];
  tags?: string[];
  sourcePointIds: string[];
  version: number;
  editedByUser: boolean;
  status: 'ready' | 'error' | 'stale';
  createdAt: string;
  updatedAt: string;
}
```

**新增本地文件结构定义：**
```typescript
// content-points.json
{
  "theme": string,
  "points": GeneratedPoint[],
  "updatedAt": string
}

// content-drafts.json
{
  "drafts": {
    "twitter": GeneratedContentDraft,
    "redbook": GeneratedContentDraft
  },
  "updatedAt": string
}
```

## 19. 验收标准

V1 完成后，应满足以下验收条件：

### 19.1 功能验收

| 编号 | 验收项 | 测试方法 | 预期结果 |
|------|--------|----------|----------|
| 19.1.1 | 内容生成 Tab 存在 | 打开转录详情页，查看页签 | 存在”内容生成”页签 |
| 19.1.2 | 转录未完成时不可生成 | 打开转录中的详情页 | 按钮禁用或有提示 |
| 19.1.3 | 观点提炼功能 | 点击”提炼观点”按钮 | 成功生成观点并展示 |
| 19.1.4 | 观点勾选功能 | 勾选/取消勾选观点 | Checkbox 状态正确切换 |
| 19.1.5 | 未选观点时禁用生成 | 不勾选任何观点 | “生成内容”按钮禁用 |
| 19.1.6 | Twitter 生成 | 选择 Twitter 平台并生成 | 生成 4-8 条推文 |
| 19.1.7 | 小红书生成 | 选择小红书平台并生成 | 生成标题 + 正文 + 标签 |
| 19.1.8 | 复制功能 | 点击”复制”按钮 | 内容成功复制到剪贴板 |
| 19.1.9 | 编辑与保存 | 编辑内容后保存 | 保存后内容不丢失 |
| 19.1.10 | 重写功能 | 点击”重写”按钮 | 生成新的内容版本 |
| 19.1.11 | stale 状态标记 | 重新提炼观点后查看旧内容 | 旧内容标记为”已过期” |
| 19.1.12 | 持久化 | 关闭应用后重新打开 | 观点和内容结果仍存在 |
| 19.1.13 | 失败重试 | 模拟网络失败后重试 | 重试后成功生成 |
| 19.1.14 | 错误提示 | 模拟模型 API 失败 | 显示友好的错误信息 |

### 19.2 性能验收

| 编号 | 验收项 | 测试方法 | 预期结果 |
|------|--------|----------|----------|
| 19.2.1 | 观点提炼耗时 | 转录完成后触发观点提炼 | 90 秒内完成 |
| 19.2.2 | 内容生成耗时 | 选择观点后触发内容生成 | 60 秒内完成 |
| 19.2.3 | 长文本处理 | 导入 2 小时+ 的转录 | 正常处理并提示截断 |
| 19.2.4 | 缓存命中 | 重复获取同一转录的观点 | 瞬间返回，不重复请求 |

### 19.3 兼容性验收

| 编号 | 验收项 | 测试方法 | 预期结果 |
|------|--------|----------|----------|
| 19.3.1 | OpenAI Provider | 使用 OpenAI 模型 | 正常生成 |
| 19.3.2 | Claude Provider | 使用 Claude 模型 | 正常生成 |
| 19.3.3 | Qwen Provider | 使用 Qwen 模型 | 正常生成 |
| 19.3.4 | 模型未配置 | 删除 API Key 后尝试生成 | 提示前往配置 |

## 20. 里程碑建议

### Phase 1（基础框架 + 小红书，预计 4-5 天）

| 任务 | 负责人 | 产出 |
|------|--------|------|
| 前端：内容生成 Tab 基础结构 | 前端 | 可切换的 Tab 页面 |
| Helper：观点提炼接口 | 后端 | `POST /content-points/generate` |
| Helper：获取观点接口 | 后端 | `GET /content-points` |
| 前端：观点提炼 UI | 前端 | 观点列表展示 + 勾选 |
| 前端：平台选择器 | 前端 | 小红书平台选择 |
| Helper：小红书生成接口 | 后端 | `POST /content/generate` (redbook) |
| 前端：小红书结果卡片 | 前端 | 标题 + 正文 + 标签展示 + 复制 |
| Helper：保存/获取草稿接口 | 后端 | `GET/POST /content` |
| Prompt：观点提炼模板 | 产品 | 完成并测试 |
| Prompt：小红书生成模板 | 产品 | 完成并测试 |

**Phase 1 验收：**
- 用户可切换到内容生成 Tab
- 用户可点击"提炼观点"并看到结果
- 用户可勾选观点生成小红书文案
- 生成结果可复制
- 观点和内容结果持久化保存

---

### Phase 2（Twitter 生成 + 编辑，预计 3-4 天）

| 任务 | 负责人 | 产出 |
|------|--------|------|
| 前端：平台选择器扩展 | 前端 | 支持 Twitter 切换 |
| Helper：Twitter 生成接口 | 后端 | `POST /content/generate` (twitter) |
| 前端：Twitter 结果卡片 | 前端 | Thread 展示 + 复制 |
| Prompt：Twitter 生成模板 | 产品 | 完成并测试 |
| 前端：编辑功能 | 前端 | Textarea 编辑 |
| Helper：保存编辑内容接口 | 后端 | `POST /content/save` |
| 前端：过期状态提示 | 前端 | stale 状态 UI |

**Phase 2 验收：**
- 用户可生成 Twitter Thread
- 用户可编辑并保存内容（小红书/Twitter）
- 观点变化后旧内容标记为过期

---

### Phase 3（完善 + 测试，预计 2-3 天）

| 任务 | 负责人 | 产出 |
|------|--------|------|
| 前端：重写功能 | 前端 | 点击重写生成新版本 |
| Helper：重写接口 | 后端 | `POST /content/regenerate` |
| 前端：错误态处理 | 前端 | 各种错误场景 UI |
| Helper：长文本处理 | 后端 | 截断策略 + 提示 |
| 前端：边界情况处理 | 前端 | 观点数量提示等 |
| 整体：验收测试 | 测试 | 完成验收清单 |

**Phase 3 验收：**
- 所有 P0/P1 功能完成
- 通过全部验收测试
- 无明显 Bug

---

### 总体排期

```
Week 1: Phase 1 + Phase 2（基础框架 + Twitter 生成）
Week 2: Phase 3 + Phase 4（小红书 + 编辑 + 测试）
```

**预计总工期：8-12 个工作日**
