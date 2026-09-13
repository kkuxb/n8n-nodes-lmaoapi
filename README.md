<!-- generated-by: gsd-doc-writer -->

# n8n-nodes-lmaoapi

[![npm version](https://img.shields.io/npm/v/n8n-nodes-lmaoapi.svg)](https://www.npmjs.com/package/n8n-nodes-lmaoapi)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE.md)

一个用于在 n8n 中调用 LmaoAPI 的社区节点，当前提供文字生成、图像生成和音频转文本三种模式。

## 功能概览

- **文字生成**：默认使用 `gpt-5.6-sol`，支持自定义模型 ID、系统提示词、文档文本拼接和最多 10 张图片输入。
- **图像生成**：支持 GPT-Image-2.5 Sunburst、GPT-Image-2.5 Flare、GPT-Image-2 和 Nano Banana 2，生成结果直接输出为 n8n Binary。
- **音频转文本**：固定使用 `whisper-1`，支持纯文本与句级时间戳 JSON，并额外输出可直接拖拽使用的 `time-text` 字段。
- **多种 Binary 来源**：可从当前节点输入、指定节点读取图片或音频；文字与图像模式还支持从 URL 获取图片。
- **长任务超时**：所有 API 请求统一使用 600 秒超时。

> 当前节点界面只开放上述三种模式。仓库中保留的视频与向量相关实现不属于 1.4.0 的公开节点功能。

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
| Nano Banana 2     | `gemini-3.1-flash-image-preview` | 1K / 2K / 4K  | 13 种  | —                |

Nano Banana 1 Pro 和即梦 5.0 已从图像生成模式移除。旧工作流如果仍选用这两个模型，执行时会提示重新选择模型，不会发送生图请求。

三个 GPT Image 模型在节点中使用不带 `-c` 的模型值，发送请求时明确映射到上表 ID。默认模型仍为 GPT-Image-2。三个模型共享以下尺寸：

- `auto`
- `1024x1024`、`1024x1536`、`1536x1024`
- `2048x1152`、`2048x2048`
- `2160x3840`、`3840x2160`
- 符合接口约束的自定义尺寸，例如 `2048x1152`

GPT-Image-2 的质量可选自动、低、中、高；输出格式可选 PNG、JPEG、WEBP。背景设置目前不在节点界面开放，固定使用自动背景。

仅两个 GPT-Image-2.5 模型额外提供超高（`xhigh`）、最高（`max`）质量，以及自动、不透明、透明背景。透明背景使用官方 `background: "transparent"`，必须配合 PNG 或 WEBP，选择 JPEG 会在发送请求前报错。暂不提供压缩参数。

### GPT Image 图片输出

三个 GPT Image 模型均兼容 `data[0].b64_json` 和 `data[0].url`：

- Base64：解码后输出至 `binary.data`。
- URL：自动下载图片至 `binary.data`，同时在 `json.imageUrl` 输出服务商返回的完整链接。
- 两个字段同时存在：使用 Base64 图片并保留 `json.imageUrl`，避免额外下载。

图片链接可能是临时签名链接，请及时保存 Binary 图片。URL 下载不附带麦包 API Key；下载失败会明确报错并附带生图请求 ID（若服务商提供），不会自动重复生图。

[OpenAI 官方参数说明](https://developers.openai.com/api/reference/resources/images/methods/generate)明确 `response_format` 的 URL/Base64 选择适用于 DALL·E 2/3，不支持 GPT Image。因此三个 GPT Image 模型均不发送此参数，也没有返回模式选择器；对 URL 的支持用于兼容服务商实际响应。`output_format` 只选择 PNG/JPEG/WEBP 文件格式。

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

在 `main` 分支完成 lint、构建、测试并提交全部修改后，用 release-it 推送代码与 tag、创建 GitHub Release。发布说明自动读取 CHANGELOG 中对应版本；npm 自动发布及登录检查已关闭，npm 由维护者手动发布。

GitHub 发布需要 `GITHUB_TOKEN`。已登录 GitHub CLI 时，可在 PowerShell 中临时使用当前账号的凭据：

```powershell
$env:GITHUB_TOKEN = gh auth token
```

本次版本号已同步为 `1.4.0`，使用 `--no-increment` 保持版本不变：

```bash
npm run release -- --no-increment --dry-run
npm run release -- --no-increment
```

GitHub 发布完成后，维护者可在该 tag 对应代码上执行 `npm publish`，并手动完成 npm 身份验证。

## 1.4.0 更新内容

- 凭证 API 地址改为下拉框，默认使用 `https://ai.lmao.net.cn`，另可选择 `https://api.lmao.net.cn`；实际地址均带 `/v1`，保留 `lmaoBaseUrl` 字段及旧凭证地址兼容。
- 节点和凭证统一采用真正的龙猫矢量 SVG Logo，裁去四周多余留白，完整保留图案和 LMAO 文字。
- 更新上游同步规则，持续保留 LmaoAPI 域名、凭证、Logo 和发布说明；CI 与 GitHub 发布统一使用本仓库的 `main` 分支。

- 新增 GPT-Image-2.5 Sunburst 和 Flare，依次置于图像模型下拉框最前方，请求时映射到对应的 `-c` 模型 ID；默认模型仍为 GPT-Image-2。
- 修复服务商返回图片 URL 时误报“未返回图片”的问题。三个 GPT Image 模型均兼容 Base64 和 URL，URL 自动下载到 `binary.data`，并同步输出到 `json.imageUrl`。
- 仅两个新模型增加超高（`xhigh`）、最高（`max`）质量与背景设置；透明背景支持 PNG/WEBP，暂不开放压缩设置。
- 根据图片实际内容识别文件格式；区分无图片、服务商业务错误和下载失败，下载失败不会重新发起生图。
- 移除 Nano Banana 1 Pro 和即梦 5.0。升级前请将使用这两个模型的工作流改为当前支持的模型，否则执行时会提示重新选择。

完整版本记录见 [CHANGELOG.md](CHANGELOG.md)。

## 项目说明

本项目由作者结合 AI 辅助持续迭代，主要服务于电商内容生产和自动化工作流。如遇问题，请在 [GitHub Issues](https://github.com/kkuxb/n8n-nodes-lmaoapi/issues) 提交可复现信息。

作者微信：`maosonghuai`

## License

本项目采用 [MIT License](LICENSE.md)。
