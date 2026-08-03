# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.5] - 2026-08-03

### Added

- 音频转文本的句级时间戳输出新增 `time-text` 字符串字段，位于 `sentences` 之前，可直接拖拽到后续节点使用
- 保留原有 `sentences` 结构化数组，确保现有工作流兼容
- 文字、图像和语音模式的 Binary 属性名默认值统一为 `data,data0,data1,data2,data3,data4,data5`

### Changed

- 项目版本更新为 `1.3.5`，同步更新包元数据、节点简介和测试脚本
- 重写 README，使公开模式、模型参数、Binary 来源、本地开发环境和音频输出说明与当前代码一致

### Fixed

- 修复旧版凭证复用上游 `baseUrl` 导致 API 地址显示错误的问题；LmaoAPI 凭证现在默认使用 `https://api.lmao.net.cn`
## [1.3.4] - 2026-07-31

### Changed

- 文字生成默认模型由 `gemini-3.1-pro-preview` 更新为 `gpt-5.6-sol`
- `GPT-Image-2` 前台名称和选项值继续保持 `gpt-image-2`，实际 API 请求模型 ID 更新为 `gpt-image-2-c`
- 所有 HTTP 请求的超时时间统一调整为 600 秒（10 分钟）

## [1.3.0] - 2026-04-22

### Added

- 新增 `GPT-Image-2` 图像生成支持
  - 支持文生图
  - 支持图生图与多图参考输入
  - 支持背景、质量、输出格式、自动/横图/竖图尺寸参数
  - 输出结果直接返回为 Binary 图片
- 新增 `test:gpt-image-2` 回归测试脚本
- 新增项目本地固定版 n8n 开发运行时脚本 `scripts/dev.mjs`

### Changed

- 图片生成 README 重点突出 `GPT-Image-2` 的使用方式与能力
- `npm run dev` 改为复用项目本地 `.n8n-dev-server/`，不再每次临时下载 n8n
- `.gitignore` 补充本地开发缓存、规划目录与 API 参考资料目录

### Fixed

- 修复 `GPT-Image-2` 图生图请求链路
  - 调整图像编辑 multipart 请求构造
  - 增加图像请求调试日志，便于排查运行时问题
- 修正 Gemini 图像生成配置，按模型发送更合适的参数

## [1.1.3] - 2026-03-09

### Changed

- 音频转文本模式超时时间延长至 600 秒（10 分钟）
  - 支持处理更长的音频文件
  - 其他模式保持 300 秒（5 分钟）超时时间不变

## [1.1.2] - 2026-03-09

### Changed

- 音频转文本 verbose_json 格式现在输出**句级别时间戳**（而非词级别）
  - 自动将词级别时间戳转换为句级别时间戳
  - 按空格分割句子，提取每句话的开始和结束时间
  - 时间保留 1 位小数（秒为单位）
  - 输出 `sentences` 字段，每个句子包含 `text`、`start`、`end`
  - 数据量减少约 90%，可读性大幅提升
  - 更适合段落摘要、时间轴分析等实际应用场景

### Technical

- 新增 `convertWordsToSentences()` 函数用于时间戳转换
- 修改 verbose_json 输出逻辑，自动应用句级别转换
- 添加 `timestampGranularity: 'sentence'` 元数据标识

## [1.1.1] - 2026-03-09

### Fixed

- 修正 `timestamp_granularities` 参数格式
  - 将 `formData.timestamp_granularities = ['word']` 改为 `formData['timestamp_granularities[]'] = 'word'`
  - 修复 verbose_json 格式未返回词级别时间戳的问题
  - 已通过实际 API 测试验证

## [1.1.0] - 2026-03-08

### Added

- 音频转文本模式（Whisper-1）
  - 使用 whisper-1 模型进行音频转写
  - 支持 9 种音频格式：flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm
  - 支持自动语言识别和手动语言选择（中文/英语）
  - 支持两种输出格式：
    - 带时间戳的 JSON 格式（包含词级别时间戳，更简洁精确）
    - 纯文本格式（仅返回转写文本）
  - 自动音频文件提取和格式验证
  - 支持从当前节点或指定节点读取 Binary 音频数据
  - 完整的错误处理和友好的错误提示
  - 适配抖音等平台视频音频转录场景

### Changed

- Binary 来源模式现在支持音频文件读取
- 凭证配置优化：Base URL 改为隐藏字段，用户无法修改，避免配置错误
- 音频转文本 verbose_json 格式使用词级别（word）时间戳，输出更简洁（仅包含 word、start、end 字段）
- 更新 README.md 添加音频转文本功能说明

### Technical

- 新增 `AudioData` 接口定义
- 新增 `extractAudioFromBinary` 函数用于音频文件提取
- 新增 3 个节点参数：audioPropertyName, audioLanguage, audioResponseFormat
- API 端点: `POST /v1/audio/transcriptions`
- verbose_json 格式添加 `timestamp_granularities[]=word` 参数

## [1.0.0] - 2024-03-06

### Added

- 初始版本发布
- 文字生成模式
  - 支持文字 + 图片的多模态输入
  - 默认模型: `gemini-3.1-pro-preview`
  - 自动处理 Binary 图片数据（最多 3 张）
  - 支持文档附件自动提取
- 图像生成模式
  - Gemini-3.1-Flash-Image 模型（支持 13 种尺寸比例）
  - Gemini-3-Pro-Image 模型（支持 9 种尺寸比例，1K/2K/4K 分辨率）
  - 即梦 5.0 模型（支持 2K/3K 分辨率）
  - 支持文生图和图生图
- 视频生成模式（Sora 2）
  - 创建视频、混编视频、检索视频、下载视频、历史列表
  - 故事板模式支持分镜控制
  - 智能轮询等待机制
- 向量嵌入模式（Embeddings）
  - 支持 text-embedding-3-large 和 text-embedding-3-small
- 跨节点 Binary 读取功能
- API 端点: `https://api.lmao.net.cn/v1`

### Technical

- 基于 n8n-workflow 框架
- TypeScript 实现
- 完整的类型定义
- 自动 Base64 转换

[1.3.5]: https://github.com/kkuxb/n8n-nodes-lmaoapi/releases/tag/v1.3.5
[1.3.4]: https://github.com/kkuxb/n8n-nodes-lmaoapi/releases/tag/v1.3.4
[1.1.0]: https://github.com/kkuxb/n8n-nodes-lmaoapi/releases/tag/v1.1.0
[1.0.0]: https://github.com/kkuxb/n8n-nodes-lmaoapi/releases/tag/v1.0.0
