# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.4.3] - 2026-10-09

### Changed

- 音频转文本在内部切换到固定提示词转写，保持原模式名称，隐藏语言和输出格式控件。
- 使用纯 JavaScript 提取普通 MP4/M4A 的 AAC 音轨、封装并切分 M4A；无需 FFmpeg 或新增运行时依赖。约 30 秒切片，支持三路并发、失败片段重试和执行取消。
- **音频输出兼容性变化**：音频成功输出只保留 `text`，内容为带全片秒级起止时间的 Markdown。旧工作流需更新对 `time-text`、`sentences`、`_metadata` 的引用；原 `text` 也改为含时间戳的 Markdown。本版暂不支持 MP3、WAV、分片 MP4 等输入。
- 完整保留旧 Whisper 请求、控件和输出，维护者可通过 `ACTIVE_AUDIO_BACKEND` 恢复。
- 文字生成默认模型改为 `claude-sonnet-5-5`；删除 GPT 绘图模型下方的图片下载说明。

## [1.4.2] - 2026-10-09

### Changed

- 将 Nano Banana 2 替换为 Nano Banana 2.1，请求 ID 使用 `gemini-nano-banana-2.1-preview`，补充 `21:9` 比例；旧工作流需重新选择模型。
- 三个 GPT Image 模型的文生图及参考图编辑请求固定发送 `response_format: "b64_json"`，不增加前端返回格式选项；服务商返回 Base64 时直接输出 Binary，避免额外下载结果图片。
- 保留 URL 响应兼容、链接输出与下载重试，兼容服务商未遵循返回格式参数的情况；仅返回 Base64 时不提供图片 URL。
- 更新 README 的返回格式说明，区分 OpenAI 官方约定与上游麦包实测；LmaoAPI 跟随上游设置，线上响应行为尚未验证。

### Fixed

- 发布预览直接读取 CHANGELOG，修复 Windows 下 release-it 使用 Git 修订表达式时的转义错误；npm 发布保持关闭。

- Nano Banana 图片根据实际文件头设置扩展名和 MIME，修复 JPEG 被固定标记为 PNG；跳过思考图片并兼容两种内联图片字段命名。

## [1.4.1] - 2026-09-13

### Added

- GPT Image 结果 URL 下载支持首次请求加最多 3 次重试，单次最多 20 秒，含退避等待的总预算最多 80 秒；每次都使用同一 URL，不重复生图。
- 对临时网络错误与 HTTP 408/429/500/502/503/504 进行有界重试，支持 Retry-After、独立截止计时和执行取消。
- 在执行错误详情保留可恢复的图片 URL、生图请求 ID、失败阶段及各次下载状态/耗时/内容类型等诊断；Continue On Fail 同样输出恢复信息。

### Fixed

- 将生图 HTTP 状态与下载 HTTP 状态分开，区分响应解析、URL 校验、下载、格式识别和 Binary 写入错误。
- 不再把底层异常、响应原文或凭据拼入错误消息；完整签名 URL 仅保留于执行详情。
- 为隐藏视频操作按工作流程排列并设置局部排序例外，消除中文 Windows 与英文 Linux 的排序规则差异。

### Changed

- CI 增加完整回归测试（包含构建），发布前确认远端检查通过。
- 增加整体节点自动重试风险提示及独立下载恢复说明，同步版本与相关文档到 1.4.1。
- 保持下载失败报错、成功时 Binary/URL 输出以及 npm 手动发布流程。


## [1.4.0] - 2026-09-13

### Added

- 新增 GPT-Image-2.5 Sunburst 和 Flare，依次置于图像模型下拉框最前方，请求时映射到各自的 `-c` 模型 ID。
- 仅两个新模型开放超高（`xhigh`）、最高（`max`）质量和自动/不透明/透明背景；透明背景必须使用 PNG 或 WEBP，JPEG 会在请求前被拒绝。

### Fixed

- 修复 GPT Image 收到 URL 图片响应时误报“未返回图片”的问题，同时支持 `data[0].b64_json` 和 `data[0].url`。
- URL 图片自动下载到 `binary.data`，原链接同步输出到 `json.imageUrl`；同时收到两种数据时优先解码 Base64 并保留 URL。
- 根据实际图片文件头确定 MIME 和扩展名，区分无图片、业务错误和下载失败；下载不携带服务商凭据，失败不重复生图，错误中保留可用的生图请求 ID。

### Changed

- 凭证 API 地址改为下拉框，默认使用 `https://ai.lmao.net.cn`，另可选择 `https://api.lmao.net.cn`；实际地址均带 `/v1`，保留 `lmaoBaseUrl` 字段及旧凭证地址兼容。
- 节点和凭证统一采用真正的龙猫矢量 SVG Logo，裁去四周多余留白，完整保留图案和 LMAO 文字。
- 更新上游同步规则，持续保留 LmaoAPI 域名、凭证、Logo 和发布说明；CI 与 GitHub 发布统一使用本仓库的 `main` 分支。

- 同步 README、包元数据和项目索引至 `1.4.0`。默认模型仍为 GPT-Image-2。
- 发布脚本仅自动处理 Git 推送、版本 tag 和 GitHub Release，关闭 npm 自动发布及登录检查；npm 由维护者手动发布。
- 明确 GPT Image 不发送 `response_format`，不提供返回模式选择器；暂不开放压缩设置。

### Removed

- 从图像生成模式移除 Nano Banana 1 Pro 和即梦 5.0，包括专属参数与执行分支。使用已移除模型的旧工作流必须重新选择模型，否则执行会报错且不发送生图请求。


## [1.3.8] - 2026-09-01

### Changed

- 将节点与凭证的 PNG 图标替换为保持原 Logo 视觉的 SVG，并同步更新图标引用
- 将 CI 工作流的推送监听分支从不存在的 `main` 修正为仓库默认分支 `master`
- 使用仓库级 release-it 配置支持从 `master` 执行完整发布流程
- 同步 README、包元数据和项目索引至 `1.3.8`

## [1.3.7] - 2026-09-01

### Changed

- 将凭证中的 API 地址从隐藏固定值改为下拉选项，可选择 `https://api.lmao.net.cn` 或
  `https://ai.lmao.net.cn`
- 新建凭证默认使用 `https://ai.lmao.net.cn`，内部保留 `/v1` 以兼容现有请求路径
- 保持 `baseUrl` 字段名不变，已保存的旧凭证继续使用原地址
- 新增凭证配置回归测试，并同步 README、包元数据和项目索引至 `1.3.7`

## [1.3.6] - 2026-08-21

### Fixed

- 为所有成功输出和 `continueOnFail` 输出保留 n8n `pairedItem` 关联，修复多 item
  工作流中拖拽生成的 `$('Node').item` 表达式无法追溯上游数据的问题

### Changed

- 新增 item 关联回归测试，并将公开文档与包元数据同步更新至 `1.3.6`

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

[1.4.1]: https://github.com/kkuxb/n8n-nodes-lmaoapi/releases/tag/v1.4.1
[1.4.0]: https://github.com/kkuxb/n8n-nodes-lmaoapi/releases/tag/v1.4.0
[1.3.8]: https://github.com/kkuxb/n8n-nodes-lmaoapi/releases/tag/v1.3.8
[1.3.7]: https://github.com/kkuxb/n8n-nodes-lmaoapi/releases/tag/v1.3.7
[1.3.6]: https://github.com/kkuxb/n8n-nodes-lmaoapi/releases/tag/v1.3.6
[1.3.5]: https://github.com/kkuxb/n8n-nodes-lmaoapi/releases/tag/v1.3.5
[1.3.4]: https://github.com/kkuxb/n8n-nodes-lmaoapi/releases/tag/v1.3.4
[1.1.0]: https://github.com/kkuxb/n8n-nodes-lmaoapi/releases/tag/v1.1.0
[1.0.0]: https://github.com/kkuxb/n8n-nodes-lmaoapi/releases/tag/v1.0.0
