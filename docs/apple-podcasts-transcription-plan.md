# Apple Podcasts 单集链接转录支持计划

**创建时间**：2026-04-17  
**状态**：规划中  
**优先级**：Phase 1

---

## 一、需求概述

在现有“小宇宙单集链接转录”能力基础上，新增 Apple Podcasts 单集链接识别与转录支持。

### 1.1 目标

- 保持当前转录链路不变，仅扩展输入来源
- 支持用户直接粘贴 Apple Podcasts 单集分享链接发起转录
- 继续兼容现有小宇宙单集链接

### 1.2 范围决策

| 决策点 | 选择 |
|------|------|
| 本次范围 | 在现有小宇宙支持上新增 Apple Podcasts 单集链接识别 |
| Apple 节目主页链接 | 不支持，直接提示用户粘贴单集链接 |
| 通用播客平台抽象 | 暂不做 |
| 前后端接口 | 保持现有 `/transcriptions` 不变 |

---

## 二、现状分析

### 2.1 当前播客转录链路

当前桌面端播客转录入口位于：

- `desktop/src/pages/DesktopPodcastPage.tsx`
- `helper/lib/transcription/orchestrator.js`
- `helper/lib/transcription/episode-info.js`

现状特征：

- 前端只接受包含 `/episode/<id>` 的链接
- helper 只支持按小宇宙 `episodeId` 拉取音频信息
- 转录引擎、本地 Whisper、千问 ASR、历史记录和导出链路都已具备

### 2.2 当前限制

- Apple Podcasts 链接会在前端校验阶段被拦截
- helper 中 `fetchEpisodeInfo` 仅实现了小宇宙来源解析
- 错误提示文案也默认只有一种“兼容播客单集链接”语义

---

## 三、技术方案

### 3.1 总体策略

将当前 `episode-info.js` 从“小宇宙专用解析”升级为“按链接来源分流解析”：

- 小宇宙链接继续走现有解析逻辑
- Apple Podcasts 单集链接新增独立解析分支
- 统一输出现有转录记录所需字段：
  - `title`
  - `description`
  - `audioUrl`
  - `duration`
  - `pubDate`
  - `author`
  - `thumbnail`

### 3.2 Apple 链接识别规则

支持的 Apple 链接模式：

```text
https://podcasts.apple.com/.../id<collectionId>?i=<trackId>
```

识别要求：

- 域名为 `podcasts.apple.com`
- 路径中包含节目 `id<collectionId>`
- 查询参数中包含单集 `i=<trackId>`

不支持的情况：

- 只有节目 `id<collectionId>`，没有 `i` 的节目主页链接
- 非 Apple Podcasts 域名
- 缺少节目 id 或单集 id 的不完整链接

### 3.3 Apple 单集解析流程

#### 步骤 1：提取链接参数

从 URL 中提取：

- `collectionId`：节目 ID
- `trackId`：单集 ID

#### 步骤 2：请求 iTunes Lookup

调用节目维度接口：

```text
https://itunes.apple.com/lookup?id=<collectionId>&media=podcast&entity=podcastEpisode&limit=200
```

超时配置：5 秒

#### 步骤 3：定位目标单集

在返回的 episode 列表中按 `trackId` 精确匹配目标单集。

匹配成功后映射：

- `trackName` -> `title`
- `episodeUrl` -> `audioUrl`
- `description` -> `description`
- `releaseDate` -> `pubDate`
- `artistName` -> `author`（fallback: `collectionName` -> '未知作者'）
- `artworkUrl600` -> `thumbnail`（fallback: `artworkUrl100` -> 节目封面）

**字段 Fallback 逻辑**：

```js
author: episode.artistName ?? results[0].collectionName ?? '未知作者',
thumbnail: episode.artworkUrl600 ?? episode.artworkUrl100 ?? results[0].artworkUrl600,
```

#### 步骤 4：音频 URL 验证（可选）

对 `episodeUrl` 发起 HEAD 请求验证：
- 响应状态码为 200 或 302
- `Content-Type` 为 `audio/*`

注意：实际下载时直接使用原始 URL，即使 HEAD 请求返回 302 重定向，下载逻辑会自动跟随。

#### 步骤 5：进入现有转录流程

解析成功后，继续复用当前：

- 音频下载
- 音频转换
- Whisper / 千问 ASR 转录
- 文本保存
- 历史记录

#### 步骤 4：进入现有转录流程

解析成功后，继续复用当前：

- 音频下载
- 音频转换
- Whisper / 千问 ASR 转录
- 文本保存
- 历史记录

---

## 四、实现改动

### 4.1 Helper 侧

主要改动文件：

- `helper/lib/transcription/episode-info.js`

计划修改点：

- 新增 URL 来源识别函数
- 保留现有小宇宙解析函数
- 新增 Apple 链接参数提取函数
- 新增 Apple episode lookup 请求函数
- 新增 Apple 单集匹配与字段映射逻辑
- 将 `fetchEpisodeInfo` 改为统一分流入口

建议函数结构：

```js
detectPodcastSource(url)
extractXiaoyuzhouEpisodeId(url)
extractApplePodcastIds(url)
fetchXiaoyuzhouEpisodeInfo(url, signal)
fetchAppleEpisodeInfo(url, signal)  // 包含 Fallback 逻辑
fetchEpisodeInfo(url, signal)       // 统一分流入口
```

**Apple 解析函数详细设计**：

```js
function fetchAppleEpisodeInfo(url, signal) {
  // 1. 提取 collectionId, trackId
  const { collectionId, trackId } = extractApplePodcastIds(url);
  
  // 2. 请求 iTunes API
  const response = await fetch(
    `https://itunes.apple.com/lookup?id=${collectionId}&media=podcast&entity=podcastEpisode&limit=200`,
    { signal, timeout: 5000 }
  );
  
  // 3. 匹配目标单集
  const episode = response.results.find(r => r.trackId === trackId);
  if (!episode) throw new Error('未匹配到目标单集');
  
  // 4. 字段映射（含 fallback）
  return {
    title: episode.trackName,
    description: episode.description || '',
    audioUrl: episode.episodeUrl,
    duration: episode.trackTimeMillis / 1000,
    pubDate: episode.releaseDate,
    author: episode.artistName ?? response.results[0].collectionName ?? '未知作者',
    thumbnail: episode.artworkUrl600 ?? episode.artworkUrl100 ?? response.results[0].artworkUrl600
  };
}
```

### 4.2 前端页面

主要改动文件：

- `desktop/src/pages/DesktopPodcastPage.tsx`

计划修改点：

- 放宽当前只允许 `/episode/<id>` 的输入校验
- 支持 Apple Podcasts 单集链接通过前端校验
- 对 Apple 节目主页链接提供更明确提示
- 更新 placeholder 和说明文案
- 更新错误提示语义，明确支持“小宇宙 / Apple Podcasts 单集链接”

### 4.3 不需要改动的部分

以下模块保持不变：

- `helper/lib/transcription/orchestrator.js`
- `helper/lib/http-handler.js` 的 `/transcriptions` 接口结构
- 本地 Whisper 环境检测
- 千问 ASR 配置与调用
- 转录历史、导出、思维导图生成

---

## 五、接口与输入约束

### 5.1 请求接口

保持现有接口不变：

```json
{
  "url": "string",
  "engine": "local-whisper | qwen-asr",
  "onlineASRConfig": {}
}
```

### 5.2 支持输入

- 小宇宙单集链接
- Apple Podcasts 单集链接

### 5.3 明确不支持

- Apple 节目主页链接
- 其他播客平台链接
- Apple 链接自动回退到“最新一集”

---

## 六、错误处理

### 6.1 Apple 节目主页链接

错误提示：

```text
当前仅支持 Apple Podcasts 单集链接，请打开具体单集后重新分享链接。
```

### 6.2 Apple 链接缺少必要参数

错误提示：

```text
无效的 Apple Podcasts 链接，请确认链接包含节目和单集信息。
```

### 6.3 Apple 接口未匹配到目标单集

错误提示：

```text
暂时无法从该 Apple 链接解析出单集音频，请确认是单集分享链接后重试。
```

### 6.4 通用兜底

保留现有语义：

```text
无法获取播客音频链接，请检查链接是否正确或稍后重试。
```

---

## 七、测试计划

### 7.1 手工验证

**已验证**：
- ✅ iTunes API 返回结构符合预期
- ✅ 音频 URL 可正常下载（23MB，49 分钟，HTTP 200）
- ✅ 重定向链接无需特殊处理

**待验证**：
- 验证小宇宙单集链接仍可正常转录（回归测试）
- 验证真实 Apple 单集分享链接可成功启动转录
- 验证 Apple 单集链接可正确解析标题与音频地址
- 验证 Apple 节目主页链接会立即报错
- 验证非法 Apple 链接不会进入下载和转录阶段

**测试用例**：
```
# 有效 Apple 单集链接
https://podcasts.apple.com/cn/podcast/.../id1676099257?i=1000761903050

# Apple 节目主页链接（应报错）
https://podcasts.apple.com/cn/podcast/id1676099257

# 小宇宙单集链接（回归）
https://www.xiaoyuzhoufm.com/episode/...
```

### 7.2 工程校验

- 运行 `npm run typecheck`

如后续补测试框架，可增加：

- URL 识别函数测试
- Apple id 提取测试
- Apple 响应映射测试

---

## 八、验收标准

- 用户输入 Apple Podcasts 单集分享链接后，能够进入现有转录流程
- 小宇宙单集转录能力无回归
- Apple 节目主页链接会被明确拒绝，并给出清晰提示
- 前后端接口结构保持兼容，不引入新的用户配置步骤

---

## 十、风险与边界情况

### 10.1 已验证风险

| 风险 | 状态 | 应对 |
|------|------|------|
| `artistName` 可能为 null | ✅ 已处理 | fallback 到 `collectionName` |
| 音频 URL 带签名/时效性 | ✅ 验证通过 | 喜马拉雅 CDN 链接可直接下载 |
| 音频 URL 302 重定向 | ✅ 验证通过 | 下载逻辑自动跟随重定向 |

### 10.2 待观察边界

| 边界情况 | 处理策略 |
|----------|----------|
| iTunes API 超时 | 5 秒超时，错误提示"网络请求超时" |
| iTunes API 限流 | 暂不处理，出现 429 时记录日志 |
| 单集无 description | 返回空字符串，前端显示"无简介" |
| 无封面图 | fallback 到节目封面 |
| 地区限制内容 | API 返回空列表，提示"该内容在您所在地区不可用" |

### 10.3 不支持的情况

- Apple 节目主页链接（无 `?i=` 参数）
- 其他播客平台链接（Spotify、Overcast 等）
- RSS feed 链接直接解析

---

## 十一、后续扩展方向

- 支持 Apple 节目主页链接后弹出集数选择器
- 支持 RSS feed 链接解析
- 抽象为通用播客来源解析层
- 扩展 Spotify、Overcast、Pocket Casts 等平台链接兼容
