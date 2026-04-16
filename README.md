# n8n-nodes-LmaoAPI

在 n8n 中通过独立的 LmaoAPI 社区节点调用文字生成、图像生成与音频转文本能力，无需手动拼接复杂 HTTP Request。

---

## 功能概览

- **文字生成**：支持自定义模型 ID，并可组合文字 + 图片输入。
- **图片生成**：支持文生图、图生图，输出直接返回 n8n Binary 图片数据。
- **音频转文本**：支持 Whisper 转写与带时间戳的结构化输出。
- **Binary 数据复用**：支持从当前输入、指定上游节点或图片 URL 读取媒体数据。

本包当前目标是把现有工作流体验迁移为 **LmaoAPI 独立品牌版本**，保持已有能力与参数习惯，避免迁移时重新设计工作流。

---

## 安装

在 n8n 根目录执行：

```bash
npm install n8n-nodes-lmaoapi
```

或者在 n8n 的 **Community Nodes** 中搜索以下任一标识进行安装：

- `n8n-nodes-lmaoapi`
- `LmaoAPI`

---

## 使用流程

### 1. 创建凭证

在 n8n 凭证管理页面创建 **LmaoAPI API** 凭证。

- **API Key**：填写你的 LmaoAPI 密钥。
- **Base URL**：默认值是 `https://api.lmao.net.cn`。

> `Base URL` 是**高级覆盖项**。默认情况下直接使用官方地址即可；只有在你接入自建兼容网关、代理层或其他明确的兼容入口时才需要修改。

### 2. 添加节点

在工作流中搜索 **LmaoAPI**，选择该社区节点并绑定刚创建的 **LmaoAPI API** 凭证。

### 3. 配置模式

节点当前提供以下模式：

- 文字生成
- 图像生成
- 音频转文本

按照原有使用方式填写模型、提示词、参考图、音频属性名等参数即可。

---

## 模式说明

### 1. 文字生成模式

- 支持手动指定模型 ID，例如 `gemini-3.1-pro-preview`、`gemini-3-flash`。
- 支持 **文字 + 图片** 多模态输入。
- 节点会自动读取并转换 Binary 中的图片内容。
- 可配合上游文档提取节点，把提取出的文本内容与用户提示词拼接后一起发送。

### 2. 图片生成模式

- 输入可为文本或参考图。
- 输出直接返回 n8n Binary 图片。
- 保留分辨率、尺寸比例、单图/多图参考等现有参数体验。
- 当前支持的图像模型包括：
  - `gemini-3.1-flash-image-preview`
  - `gemini-3-pro-image-preview`
  - `doubao-seedream-5-0-260128`

### 3. 音频转文本模式

- 使用 `whisper-1` 模型
- 支持 `flac`、`mp3`、`mp4`、`mpeg`、`mpga`、`m4a`、`ogg`、`wav`、`webm`
- 支持自动识别语言，或手动指定中文 / 英语
- 支持纯文本与带时间戳 JSON 输出

---

## Binary 数据说明

- 图片属性名默认值：`data, data0, data1, data2, file, attachment`
- 音频属性名默认值：`data, data0, video, video0, audio, audio0`
- **Binary 来源模式** 可从以下来源读取媒体：
  - 当前节点输入
  - 指定节点
  - 图片 URL（适用于支持图片输入的模式）

如果你的上游节点使用了不同的 Binary 属性名，请按实际情况调整对应参数。

---

## 维护与验证

发布前建议至少执行：

```bash
npm run lint
npm run build
```

本阶段为身份与接入面迁移，重点是确保：

- 安装包名称为 `n8n-nodes-lmaoapi`
- 节点与凭证品牌均为 `LmaoAPI`
- 默认连接地址为 `https://api.lmao.net.cn`
- 现有能力与工作流体验保持兼容

---

## 许可证

MIT
