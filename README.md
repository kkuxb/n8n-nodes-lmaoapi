<!-- generated-by: gsd-doc-writer -->

# n8n-nodes-lmaoapi

[![npm version](https://img.shields.io/npm/v/n8n-nodes-lmaoapi.svg)](https://www.npmjs.com/package/n8n-nodes-lmaoapi)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE.md)

一个用于在 n8n 中调用 LmaoAPI 的社区节点，当前提供文字生成、图像生成和音频转文本三种模式。

## 功能概览

- **文字生成**：默认使用 `claude-sonnet-5-5`，支持自定义模型 ID、系统提示词、文档文本拼接和最多 10 张图片输入。
- **图像生成**：支持 GPT-Image-2.5 Sunburst、GPT-Image-2.5 Flare、GPT-Image-2 和 Nano Banana 2.1，生成结果直接输出为 n8n Binary。
- **音频转文本**：自动提取 MP4/M4A 的 AAC 音轨并分段转写，只输出带全片时间戳的 Markdown `text` 字段。
- **多种 Binary 来源**：可从当前节点输入、指定节点读取图片或音频；文字与图像模式还支持从 URL 获取图片。
- **长任务超时**：文字与绘图 API 请求使用 600 秒超时；音频每次请求最多 180 秒、每个文件预算 600 秒；GPT Image 结果 URL 下载单次最多 20 秒、含重试等待总计最多 80 秒。

> 当前节点界面只开放上述三种模式。仓库中保留的视频与向量相关实现不属于当前公开节点功能。

## 安装

推荐在 n8n 的 **Settings → Community Nodes** 中安装：

```text
n8n-nodes-lmaoapi
```

自托管环境也可以在相应的 n8n 节点目录执行：

```bash
npm install n8n-nodes-lmaoapi
```

安装完成后，在工作流节点搜索框中输入 `LmaoAPI`。

## 快速开始

1. 在 n8n 凭证管理中创建 `LmaoAPI API` 凭证。
2. 填入从 LmaoAPI 获取的 API Key，并选择 API 地址：`https://api.lmao.net.cn` 或
   `https://ai.lmao.net.cn`（默认）。
3. 添加 `LmaoAPI` 节点，选择文字生成、图像生成或音频转文本模式。
4. 配置提示词或 Binary 输入并执行节点。

## Binary 输入

### 来源模式

| 模式    | 当前节点输入 | 指定节点 | 图片 URL |
| ----- | ------ | ---- | ------ |
| 文字生成  | 支持     | 支持   | 支持     |
| 图像生成  | 支持     | 支持   | 支持     |
| 音频转文本 | 支持     | 支持   | 不支持    |

文字、图像和音频模式统一使用以下默认 Binary 属性名：

```text
data,data0,data1,data2,data3,data4,data5
```

节点会按照填写顺序寻找匹配属性。属性名不同或需要读取更多 Binary 时，可以直接修改这个逗号分隔列表。图片处理上限为 10 张；音频模式使用找到的第一个有效音视频文件。

选择“指定节点”时，填写一个或多个精确的节点名称，多个名称用逗号分隔。若指定节点没有可用 Binary，节点会回退到当前输入。

## 文字生成

文字生成通过 `/chat/completions` 调用兼容接口。

- 默认模型 ID：`claude-sonnet-5-5`
- 默认系统提示词：`你是一个专业的助手。`
- 模型 ID 可自由修改。
- 如果输入 Item 的 JSON 中包含非空 `text` 字段，节点会将其作为“参考文档内容”拼接到用户提示词后。
- 支持从 Binary 或 URL 加载最多 10 张图片，与文字提示一起发送。
- 输出保留接口返回的完整 JSON，便于使用 `choices`、`usage` 等原始字段。

配合 n8n 的 Extract From File 节点，可以先提取 PDF 等文件的文本，再交给文字生成模式处理。

## 图像生成

图像模式支持文生图、单图参考和多图参考。没有参考图时执行文生图；存在参考图时按模型对应的接口发送参考图片。成功后，图片位于输出 Item 的 `binary.data`。

### 模型与参数

| 前台名称              | 请求模型 ID                          | 分辨率           | 比例    | 其他参数             |
| ----------------- | -------------------------------- | ------------- | ----- | ---------------- |
| GPT-Image-2.5 Sunburst | `gpt-image-2.5-sunburst-c` | 自动、预设尺寸或自定义尺寸 | 不单独设置 | 质量、背景、PNG/JPEG/WEBP |
| GPT-Image-2.5 Flare | `gpt-image-2.5-flare-c` | 自动、预设尺寸或自定义尺寸 | 不单独设置 | 质量、背景、PNG/JPEG/WEBP |
| GPT-Image-2       | `gpt-image-2-c`                  | 自动、预设尺寸或自定义尺寸 | 不单独设置 | 质量、PNG/JPEG/WEBP |
| Nano Banana 2.1     | `gemini-nano-banana-2.1-preview` | 1K / 2K / 4K  | 14 种  | —                |

Nano Banana 1 Pro 和即梦 5.0 已从图像生成模式移除。旧工作流如果仍选用这两个模型，执行时会提示重新选择模型，不会发送生图请求。

Nano Banana 2 已替换为 Nano Banana 2.1；旧工作流需重新选择该模型。Nano Banana 2.1 沿用 Google 原生 `generateContent` 接口，支持 1K/2K/4K 和包含 `21:9` 的 14 种比例，Thinking 跟随服务商默认值。图片按实际格式输出正确的文件扩展名和 MIME；4K 超长比例的实际尺寸可能与官方表格存在偏差。

三个 GPT Image 模型在节点中使用不带 `-c` 的模型值，发送请求时明确映射到上表 ID。默认模型仍为 GPT-Image-2。三个模型共享以下尺寸：

- `auto`
- `1024x1024`、`1024x1536`、`1536x1024`
- `2048x1152`、`2048x2048`
- `2160x3840`、`3840x2160`
- 符合接口约束的自定义尺寸，例如 `2048x1152`

GPT-Image-2 的质量可选自动、低、中、高；输出格式可选 PNG、JPEG、WEBP。背景设置目前不在节点界面开放，固定使用自动背景。

仅两个 GPT-Image-2.5 模型额外提供超高（`xhigh`）、最高（`max`）质量，以及自动、不透明、透明背景。透明背景使用官方 `background: "transparent"`，必须配合 PNG 或 WEBP，选择 JPEG 会在发送请求前报错。暂不提供压缩参数。

### GPT Image 图片输出

三个 GPT Image 模型的文生图和参考图编辑请求均固定发送 `response_format: "b64_json"`，不提供返回格式选项。收到 Base64 后直接解码为图片，无需再次下载结果 URL；同时继续兼容 `data[0].b64_json` 和 `data[0].url`：

- Base64：解码后输出至 `binary.data`；若服务商没有同时返回 URL，则不输出 `json.imageUrl`。
- URL：自动下载图片至 `binary.data`，同时在 `json.imageUrl` 输出服务商返回的完整链接。
- 两个字段同时存在：使用 Base64 图片并保留 `json.imageUrl`，避免额外下载。

图片链接可能是临时签名链接，请及时保存 Binary 图片。URL 下载不附带LmaoAPI API Key；下载失败会明确报错并保留恢复信息。内部下载重试只访问同一图片 URL，不重新调用生图接口。

[OpenAI 官方参数说明](https://developers.openai.com/api/reference/resources/images/methods/generate)将 `response_format` 标记为旧模型遗留参数，不支持 GPT Image。但上游在 2026-10-09 对麦包服务的 `gpt-image-2-c` 文生图对照实测中，该参数能分别控制 Base64 和 URL 返回。本节点跟随上游向 LmaoAPI 固定请求 Base64，并保留服务商仍返回 URL 时的下载兼容；两个 GPT-Image-2.5 模型及参考图编辑接口尚未完成该参数的在线验证；LmaoAPI 的线上响应行为也尚未验证。`output_format` 仍只选择 PNG/JPEG/WEBP 文件格式。

### 下载重试与失败恢复（自 1.4.1 起）

每次下载最多 **20 秒**，最多重试 **3 次**（包含首次共最多 4 次），整个下载阶段连同等待最多 **80 秒**。生图请求的等待时间不计入这 80 秒。重试通常等待约 2、5、10 秒，并增加少量随机间隔；剩余预算不足时缩短最后一次请求，或提前停止。HTTP 429/503 等响应中的 `Retry-After` 也受总预算限制。

超时、连接中断及部分临时 HTTP 错误会触发下载重试；403、404、证书错误、无效 URL 和无法识别的图片内容不会盲目重试。取消执行时停止下载与等待。

**请关闭整个生图节点的“失败时重试”。** n8n 的整体重试或手动重跑仍可能重新生图扣费，内部下载重试无法阻止跨执行的重新生成。

最终失败仍然报错；在错误详情中可查看诊断 JSON，执行记录的 `error.context.imageDownload` 包含：

| 字段 | 含义 |
| --- | --- |
| `stage` | 失败阶段：生图请求、响应解析、URL 校验、下载、格式识别、Binary 写入或取消 |
| `imageUrl` | 已返回且可恢复下载的完整图片链接（如果存在） |
| `generationStatusCode` / `generationRequestId` | 生图接口状态与请求 ID |
| `attempts` | 每次下载的超时上限、耗时、状态码、异常名/代码、内容类型、已知字节数与下载请求 ID |
| `elapsedMs` / `stopReason` | 累计下载耗时与停止原因 |

未收到下载 HTTP 响应时，不会用生图的 HTTP 200 充当下载状态码。开启 Continue On Fail 时，错误输出仍保留输入关联，并额外提供 `json.imageDownload` 和可用的 `json.imageUrl`。

恢复下载时，从错误详情复制 `imageUrl` 到独立的 HTTP Request 节点：方法选 GET、认证选 None、响应格式选 File，即可单独下载已有图片。链接可能过期，请及时保存；完整签名链接仅保留在执行详情中，不写入普通日志。

## 音频转文本

选择「音频转文本」，输入含音频的 Binary 文件即可。语言自动识别，保留原语言，不自动翻译。无需安装 FFmpeg、额外程序或运行时依赖。

### 支持格式

当前支持普通、未加密 MP4/M4A 中的单条 AAC-LC / HE-AAC 音轨，支持常见的编码延迟、头尾裁剪和音轨起点信息。

暂不支持分片式 MP4、复杂多段编辑、多音轨选择，以及 MP3、WAV、FLAC、OGG、WebM 等其他容器/编码；不支持的文件会在提交前报错。单文件最大 128 MiB，最多 500,000 个 AAC 包。文件整体需读入内存，大文件或大量工作流并行时应预留内存。

### 输出格式

成功 JSON 只包含 `text`，其值为 Markdown 字符串，每个句段一条列表：

```markdown
- **[00:00–00:06]** 你是否正在寻找一款价格实惠的摩托车对讲机？
- **[00:06–00:11]** 接下来，我们会介绍几款值得关注的产品。
```

时间是全片起止时间，显示到秒；内部使用精确时间拼接。一小时以上显示小时。时间戳为估算值，切片边界、噪声和多人说话可能影响识别与对齐，不适用于逐词精准对齐。重叠部分仅对严格匹配的句段或多词短语去重；不同措辞、单词残片可能保留少量重复。纯静音返回空字符串。

下游读取：

```javascript
{{ $json.text }}
```

约 30 秒切片，片段之间保留少量上下文；单个节点执行最多 3 路并发，单次请求最多 180 秒，每个文件转写预算 600 秒。可重试故障仅重试失败片段，最多额外 2 次。任一片段最终失败，节点报错并指出失败区间，不将残缺结果作为完整文本输出。整个节点被重跑仍可能重复计费。

### 从 1.4.2 及更早版本升级

1.4.3 的音频成功输出改为单字段 `text`，**与旧音频输出结构不兼容**。原工作流引用 `time-text`、`sentences`、`_metadata` 等字段的表达式需更新；原 `text` 也改为包含时间戳的 Markdown。语言和格式控件隐藏，已保存的旧参数值保留。已有工作流显式保存的文字模型 ID 不会被新默认值覆盖。

### 维护者恢复旧后端

旧 Whisper 请求、格式、参数及输出实现完整保存在 `nodes/MaibaoApi/audio/WhisperTranscription.ts`。将 `AudioBackend.ts` 的 `ACTIVE_AUDIO_BACKEND` 从 `'omni'` 改为 `'whisper'`，构建后会恢复旧执行路径、语言/格式下拉框和完整旧输出。没有自动回退请求。恢复发布前运行两套回归测试，并在服务重新可用后做真实接口验证。

## 本地开发

### 环境要求

- 安装项目依赖和执行构建需要 Node.js/npm 环境。
- `npm run dev` 明确要求 **Node.js 24**。
- 开发脚本固定使用本地 `n8n@2.19.5` 运行时。

```bash
npm install
npm run build
npm test
npm run dev
```

| 命令                         | 用途                               |
| -------------------------- | -------------------------------- |
| `npm run build`            | 构建 TypeScript 节点并复制静态资源到 `dist/` |
| `npm run build:watch`      | 持续监听 TypeScript 变更               |
| `npm test`                 | 运行全部回归测试（需先构建）           |
| `npm run test:audio`       | 构建并验证 AAC 提取、分段转写、Markdown 输出及旧 Whisper 后端 |
| `npm run test:gpt-image-2` | 运行 GPT Image 模型与图片响应回归测试              |
| `npm run lint`             | 执行 n8n 社区节点规则检查                  |
| `npm run dev`              | 启动节点热更新和本地 n8n 开发服务器             |

首次执行 `npm run dev` 时会准备以下本地目录，后续启动会复用：

- `.n8n-dev-server-node24/`：固定版 n8n 开发运行时
- `.npm-n8n-cache-node24/`：开发运行时 npm 缓存
- `~/.n8n-node-cli/`：独立的 n8n 用户目录

Windows 下如遇原生依赖、`node-gyp` 或 SQLite 构建问题，请先确认当前 Shell 使用 Node.js 24。

## 发布版本

在 `main` 分支完成测试、提交并推送修改，确认远端 CI 通过后，使用 `npm run release` 发布 GitHub 版本。脚本会执行 lint 和构建、管理版本号、创建 Git tag、推送代码与 tag，并创建 GitHub Release；不执行 npm 发布，也不检查 npm 登录状态。

版本号已更新时，使用 `--no-increment` 保持 package.json 中的版本不变：

```bash
npm run release -- --no-increment --dry-run
npm run release -- --no-increment
```

发布预览与 GitHub 发布说明均读取 CHANGELOG 对应版本，避免 Windows 对 Git 修订表达式的转义差异。需要设置 `GITHUB_TOKEN`；已登录 GitHub CLI 时，可在 PowerShell 中执行 `$env:GITHUB_TOKEN = gh auth token`。npm 发布由维护者在对应版本的代码上单独执行 `npm publish`，并手动完成身份验证。

## 1.4.3 更新内容

- 音频转文本采用纯 JavaScript 提取 AAC、封装及切分 M4A，无需安装 FFmpeg；约 30 秒分段、三路并发，支持失败片段重试与取消。
- 模式名称保持不变，隐藏音频语言和输出格式，仅输出带秒级全片时间戳的 Markdown `text`；完整保留旧 Whisper 实现，便于维护者恢复。
- 文字生成默认模型改为 `claude-sonnet-5-5`；删除 GPT 绘图模型下方的图片下载说明。
- **升级提示**：本版音频输出结构与旧版不兼容，下游改为读取 `$json.text`。当前支持普通 MP4/M4A 的 AAC 音轨，不支持 MP3、WAV、分片 MP4 等输入；时间戳为模型估算值。

完整版本记录见 [CHANGELOG.md](CHANGELOG.md)。

## 项目说明

本项目由作者结合 AI 辅助持续迭代，主要服务于电商内容生产和自动化工作流。如遇问题，请在 [GitHub Issues](https://github.com/kkuxb/n8n-nodes-lmaoapi/issues) 提交可复现信息。

作者微信：`maosonghuai`

## License

本项目采用 [MIT License](LICENSE.md)。
