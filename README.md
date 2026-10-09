<!-- generated-by: gsd-doc-writer -->

# n8n-nodes-lmaoapi

[![npm version](https://img.shields.io/npm/v/n8n-nodes-lmaoapi.svg)](https://www.npmjs.com/package/n8n-nodes-lmaoapi)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE.md)

一个用于在 n8n 中调用 LmaoAPI 的社区节点，当前提供文字生成、图像生成和音频转文本三种模式。

## 功能概览

- **文字生成**：默认使用 `gpt-5.6-sol`，支持自定义模型 ID、系统提示词、文档文本拼接和最多 10 张图片输入。
- **图像生成**：支持 GPT-Image-2.5 Sunburst、GPT-Image-2.5 Flare、GPT-Image-2 和 Nano Banana 2.1，生成结果直接输出为 n8n Binary。
- **音频转文本**：固定使用 `whisper-1`，支持纯文本与句级时间戳 JSON，并额外输出可直接拖拽使用的 `time-text` 字段。
- **多种 Binary 来源**：可从当前节点输入、指定节点读取图片或音频；文字与图像模式还支持从 URL 获取图片。
- **长任务超时**：模型 API 请求使用 600 秒超时；GPT Image 结果 URL 下载单次最多 20 秒、含重试等待总计最多 80 秒。

> 当前节点界面只开放上述三种模式。仓库中保留的视频与向量相关实现不属于 1.4.2 的公开节点功能。

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

- 默认模型 ID：`gpt-5.6-sol`
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

音频模式使用 `whisper-1` 调用 `/audio/transcriptions`。

### 支持格式

`flac`、`mp3`、`mp4`、`mpeg`、`mpga`、`m4a`、`ogg`、`wav`、`webm`

输入既可以是音频，也可以是上述支持容器中的视频。语言可以自动识别，也可以手动指定中文或英语。

### 输出格式

- **带时间戳的 JSON 格式**：向接口请求词级时间戳，再由节点聚合为句级时间戳。
- **纯文本格式**：在顶层 `text` 字段返回转写内容，同时附带 `_metadata`。

带时间戳输出示例：

```json
{
  "task": "transcribe",
  "language": "chinese",
  "duration": 7.2,
  "text": "家里过年人多 炖肉时间长 你们也学我",
  "time-text": "[0.0s - 1.3s] 家里过年人多\n[1.5s - 2.6s] 炖肉时间长\n[2.6s - 4.0s] 你们也学我",
  "sentences": [
    {
      "text": "家里过年人多",
      "start": 0,
      "end": 1.3
    },
    {
      "text": "炖肉时间长",
      "start": 1.5,
      "end": 2.6
    },
    {
      "text": "你们也学我",
      "start": 2.6,
      "end": 4
    }
  ],
  "_metadata": {
    "model": "whisper-1",
    "format": "verbose_json",
    "audioFormat": "mp4",
    "sourceProperty": "data",
    "timestampGranularity": "sentence",
    "language": "zh"
  }
}
```

`time-text` 位于 `sentences` 之前，每句话占一行，适合直接拖到后续 AI 节点中使用。手动填写表达式时，因为字段名包含连字符，应使用：

```javascript
{{ $json["time-text"] }}
```

`sentences` 数组仍然保留，方便需要结构化 `text`、`start`、`end` 的工作流继续使用。

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
| `npm run test:audio`       | 运行音频输出与 Binary 默认值测试             |
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

GitHub 发布说明自动读取 CHANGELOG 对应版本。需要设置 `GITHUB_TOKEN`；已登录 GitHub CLI 时，可在 PowerShell 中执行 `$env:GITHUB_TOKEN = gh auth token`。npm 发布由维护者在对应版本的代码上单独执行 `npm publish`，并手动完成身份验证。

## 1.4.2 更新内容

- 三个 GPT Image 模型的文生图与参考图编辑默认请求 Base64，直接输出 Binary；保留 URL 响应兼容、链接输出和下载重试。
- 将 Nano Banana 2 替换为 **Nano Banana 2.1**，使用模型 ID `gemini-nano-banana-2.1-preview`，新增 `21:9` 比例，保留 1K / 2K / 4K。
- 修复 Nano Banana 返回 JPEG 时被标记为 PNG 的问题，按实际图片格式输出扩展名和 MIME，并跳过思考图片。
- **升级提示**：使用旧 Nano Banana 2 的工作流需要重新选择 Nano Banana 2.1；仅返回 Base64 时没有图片 URL。

完整版本记录见 [CHANGELOG.md](CHANGELOG.md)。

## 项目说明

本项目由作者结合 AI 辅助持续迭代，主要服务于电商内容生产和自动化工作流。如遇问题，请在 [GitHub Issues](https://github.com/kkuxb/n8n-nodes-lmaoapi/issues) 提交可复现信息。

作者微信：`maosonghuai`

## License

本项目采用 [MIT License](LICENSE.md)。
