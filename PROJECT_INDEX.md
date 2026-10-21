# Project Index: n8n-nodes-lmaoapi

**Generated:** 2026-10-21
**Version:** 1.5.0
**Type:** n8n Community Node Package

---

## 📁 Project Structure

```
n8n-nodes-lmaoapi/
├── credentials/
│   └── MaibaoApi.credentials.ts    # API credential definition
├── nodes/
│   └── MaibaoApi/
│       ├── MaibaoApi.node.ts       # Main node implementation
│       ├── GptImageUtils.ts       # Model mapping and request validation
│       ├── GptImageResponse.ts    # Base64/URL response handling
│       ├── audio/                # AAC extraction and segmented transcription
│       ├── video/                # URL metadata probe, full-video understanding and UI
│       └── maibaoapi.svg           # Node icon
├── dist/                           # Compiled output (published to npm)
│   ├── credentials/
│   ├── nodes/
│   └── package.json
├── .github/
│   └── workflows/
│       └── ci.yml                  # CI/CD pipeline
├── package.json                    # Package manifest
├── tsconfig.json                   # TypeScript configuration
├── eslint.config.mjs               # ESLint configuration
├── .prettierrc.js                  # Prettier configuration
├── README.md                       # User documentation (Chinese)
├── CLAUDE.md                       # Claude Code guidance
├── CHANGELOG.md                    # Version history
└── LICENSE.md                      # MIT License
```

**Total Source Code:** 3545 lines across 17 TypeScript files

---

## 🚀 Entry Points

### Main Node

- **Path:** `nodes/MaibaoApi/MaibaoApi.node.ts`
- **Class:** `MaibaoApi implements INodeType`
- **Purpose:** n8n node for LmaoAPI integration (text, image, audio, video understanding)

### Credentials

- **Path:** `credentials/MaibaoApi.credentials.ts`
- **Class:** `MaibaoApi implements ICredentialType`
- **Purpose:** API Key credential definition with a fixed API URL

### Build Output

- **Path:** `dist/`
- **Entry:** `dist/nodes/MaibaoApi/MaibaoApi.node.js`
- **Published:** Files in `dist/` directory only

---

## 📦 Core Modules

### MaibaoApi Node (`nodes/MaibaoApi/MaibaoApi.node.ts`)

**Exports:** `MaibaoApi` class
**Implements:** `INodeType` from `n8n-workflow`

**Key Functions:**

- `execute()` - Main execution handler for all modes
- `collectBinaryFromNodes()` - Collects Binary data from current/specified nodes
- `extractImagesFromBinary()` - Extracts and converts images to Base64

**Supported Modes:**

1. **Text Generation** - Chat completions with multimodal support (text + images)
2. **Image Generation** - GPT-Image-2.5 Sunburst, GPT-Image-2.5 Flare, GPT-Image-2, Nano Banana 2.1
3. **Audio Transcription** - qwen3.5-omni-flash; legacy Whisper-1 retained
4. **Video Understanding** - qwen3.5-omni-plus; full public MP4 URL input

Sora video generation and embeddings code remains in the repository but is hidden from the public node interface. Video understanding is a separate public mode.

**Key Features:**

- Cross-node Binary data reading (via `workflowDataProxy`)
- Automatic Base64 conversion for images (max 10 images)
- Pre-reading file system binaries to avoid context issues
- GPT Image Base64/URL responses produce Binary data; original URLs also appear in `json.imageUrl`
- GPT Image 2.5 quality and background controls
- Full-video URL understanding with timestamped visual/speech Markdown and bounded Range metadata reads

### Video Understanding (`nodes/MaibaoApi/video/`)

- `VideoProperties.ts` - URL-only frontend field.
- `VideoMedia.ts` - HTTP(S) URL validation, bounded Range probing, MP4 duration and size validation.
- `VideoUnderstanding.ts` - Fixed Plus request, complete SSE/interval validation and Markdown output.
- Input: ordinary public MP4, arbitrary domains, at most one hour / 2GB; metadata at most 8MiB.
- Output: `json.text`, approximately five-second visual/speech intervals, with input item pairing.
- No full local download, slicing, FFmpeg or new runtime dependencies; ten-minute execution budget and no paid-request retry.
- Upstream tested an eleven-minute sample with Maibao; LmaoAPI provider execution and one-hour detailed understanding quality remain unverified.

### MaibaoApi Credentials (`credentials/MaibaoApi.credentials.ts`)

**Exports:** `MaibaoApi` class
**Implements:** `ICredentialType` from `n8n-workflow`

**Properties:**

- `apiKey` - API authentication key (password field)

API requests and credential testing use the fixed URL `https://ai.lmao.net.cn/v1`; saved credential URLs are ignored.

---

## 🔧 Configuration Files

### package.json

- **Name:** `n8n-nodes-lmaoapi`
- **Version:** 1.5.0
- **Node Runtime:** `^22.16.0 || ^24.0.0`; development and build tooling use Node.js 24
- **License:** MIT
- **n8n API Version:** 1
- **Node Entry:** `dist/nodes/MaibaoApi/MaibaoApi.node.js`
- **Credential Entry:** `dist/credentials/MaibaoApi.credentials.js`

### tsconfig.json

- **Target:** ES2019
- **Module:** CommonJS
- **Strict Mode:** Enabled
- **Output:** `dist/`
- **Includes:** `credentials/**/*`, `nodes/**/*`, `nodes/**/*.json`, `package.json`

### .prettierrc.js

- **Tabs:** Yes (width: 2)
- **Quotes:** Single
- **Semicolons:** Yes
- **Trailing Commas:** All
- **Print Width:** 100

### eslint.config.mjs

- **Config:** `@n8n/node-cli/eslint` (default)

---

## 📚 Documentation

### README.md

- **Language:** Chinese
- **Content:** User guide, features, installation, usage examples
- **Sections:** Why, Features, Installation, Usage, Version History, Disclaimer

### CLAUDE.md

- **Purpose:** Guidance for Claude Code instances
- **Content:** Architecture, dev commands, API integration, Binary handling

### CHANGELOG.md

- **Latest:** v1.5.0 (2026-10-21)
- **Changes:** Add URL-only full-video understanding with Plus, bounded metadata probing and timestamped visuals/speech

### LICENSE.md

- **Type:** MIT License

---

## 🧪 CI/CD

### GitHub Actions (`.github/workflows/ci.yml`)

- **Triggers:** Pull requests, pushes to the `main` branch
- **Node Version:** 24
- **Runtime Compatibility:** Node.js 22.16.0 runs the full regression suite against the Node.js 24 build
- **Steps:**
  1. Install dependencies (`npm ci`)
  2. Run linter (`npm run lint`)
  3. Build and run regression tests (`npm run build && npm test`)

**Regression tests:** After building, `npm test` runs all test files (including video tests), including GPT Image model configuration, response handling and node execution. CI runs lint and the full build/test suite.

---

## 🔗 Key Dependencies

### Production (Peer Dependencies)

- `n8n-workflow` - n8n workflow types and interfaces

### Development Dependencies

- `@n8n/node-cli` - n8n node development CLI
- `typescript` (5.9.2) - TypeScript compiler
- `eslint` (9.32.0) - Code linting
- `prettier` (3.6.2) - Code formatting
- `release-it` (^19.0.4) - Release automation
- `@types/node` (^25.0.3) - Node.js type definitions

---

## 📝 Quick Start

### Development Setup

```bash
npm install              # Install dependencies
npm run build           # Build the node
npm run build:watch     # Watch mode for development
npm run dev             # Development mode with n8n
```

### Code Quality

```bash
npm run lint            # Check code style
npm run lint:fix        # Fix linting issues
```

### Release

```bash
npm run release         # Push Git commits/tags and create GitHub Release (uses release-it)
```

Automatic npm publishing and npm authentication checks are disabled. If the package version has already been updated, use `npm run release -- --no-increment` (uses the version already in package.json). The maintainer publishes to npm separately with `npm publish` and completes authentication manually.

### Installation in n8n

```bash
npm install n8n-nodes-lmaoapi
```

Or install via n8n Community Nodes UI.

---

## 🎯 API Integration

### Base URLs

- **Fixed API:** `https://ai.lmao.net.cn/v1`
- **Sora API:** `https://ai.lmao.net.cn`

### Endpoints

- **Text:** `POST /v1/chat/completions`
- **Image (Gemini):** `POST /v1beta/models/{model}:generateContent`
- **Image (GPT Image):** `POST /v1/images/generations` or multipart `POST /v1/images/edits`
- **Audio:** `POST /v1/chat/completions` (active Omni); `POST /v1/audio/transcriptions` (legacy Whisper)
- **Video Understanding:** `POST /v1/chat/completions` (qwen3.5-omni-plus, full video_url input)
The following endpoints belong to hidden modes:

- **Video Create:** `POST /v1/videos`
- **Video Retrieve:** `GET /v1/videos/{id}`
- **Video Download:** `GET /v1/videos/{id}/content`
- **Video List:** `GET /v1/videos`
- **Embeddings (hidden):** `POST /v1/embeddings`

### Supported Models

**Text Generation:**

- `claude-sonnet-5-5` (default)
- Custom model IDs supported

**Image Generation (dropdown order):**

1. `gpt-image-2.5-sunburst` → `gpt-image-2.5-sunburst-c`
2. `gpt-image-2.5-flare` → `gpt-image-2.5-flare-c`
3. `gpt-image-2` → `gpt-image-2-c` (default)
4. `gemini-nano-banana-2.1-preview` (Nano Banana 2.1) - 14 aspect ratios, 1K/2K/4K

Only the two 2.5 models expose 超高 (`xhigh`), 最高 (`max`) and background settings. Transparent backgrounds require PNG or WebP. Compression and response-format selectors are not exposed. GPT Image requests always send `response_format: 'b64_json'`. URL responses are downloaded automatically; Base64 takes priority if both fields are present, with the URL preserved.

Nano Banana 1 Pro and Jimeng 5.0 were removed. Existing workflows using them must select a supported model; otherwise execution fails before sending a generation request.

**Audio Transcription:** `qwen3.5-omni-flash`; legacy `whisper-1` retained. Pure JavaScript MP4/M4A AAC extraction uses packet-derived duration since 1.4.5 and returns timestamped Markdown `text`.

**Video Understanding:** `qwen3.5-omni-plus`; full URL input, maximum one hour / 2GB, output limit 65,536 tokens. Silent videos return visual descriptions and mark speech as absent. Input limits do not guarantee fine-grained quality at the maximum duration.

**Video Generation (hidden):**

- `sora-2-all` (Sora 2)
- `sora-2-pro-all` (Sora 2 Pro)

**Embeddings:**

- `text-embedding-3-large` (default)
- `text-embedding-3-small`

---

## 💡 Key Implementation Details

### GPT Image Download Recovery

- Up to 4 GET attempts (3 retries), 20 seconds each and 80 seconds total including waits. Never retries the generation POST.
- Error details preserve `imageUrl`, generation status/request ID and per-attempt diagnostics under `context.imageDownload`.
- Whole-node retryOnFail can still regenerate; recover with an independent HTTP Request GET instead.

### Binary Data Handling

- **Two modes:** Current node input OR specified upstream nodes
- **Pre-reading:** File system binaries pre-read using `getBinaryStream()` + `binaryToBuffer()`
- **Default properties:** `data, data0, data1, data2, data3, data4, data5`
- **Max images:** 10 for text/image generation, 1 for video reference

### Video Generation Features (hidden)

- **Storyboard mode:** Multi-shot video with duration control
- **Smart polling:** 15-second intervals, 10-minute timeout
- **Operations:** create, remix, retrieve, download, list
- **Download timeout:** 300 seconds (5 minutes)

### Node Configuration

- **usableAsTool:** `true` (AI agent integration)
- **n8nNodesApiVersion:** 1
- **Group:** `transform`
- **Inputs/Outputs:** Single main connection

---

## 🔄 Version History

### v1.5.0 (Current)

- Adds full-video understanding from arbitrary-domain public MP4 URLs with qwen3.5-omni-plus
- Reads bounded metadata instead of downloading full video; validates size/duration before a paid request
- Returns timestamped visual/speech Markdown in text, with cancellation, interval integrity checks and no paid-request retries
- Retains existing text/image/audio behavior and manual npm publishing

### v1.4.5

- Derives audio duration from complete AAC packet timing, tolerating inaccurate or unknown declared duration
- Preserves encoder delay, trims and global timestamps; clamps small tail rounding and rejects unavailable audio
- Reports specific media parsing failures and aligns active input formats to MP4/M4A
- Retains the same installation method and Markdown output without FFmpeg or new runtime dependencies

### v1.4.4

- Credentials require only an API Key; removes the API address selector
- Credential testing and all API requests use `https://ai.lmao.net.cn`, ignoring saved credential URLs
- Existing credentials continue working without recreation

### v1.4.3

- Adds segmented M4A transcription without FFmpeg, with retries and cancellation
- Audio outputs timestamped Markdown in `text`; hides legacy language and format controls
- Changes the default text model to `claude-sonnet-5-5`

### v1.4.2

- Requests Base64 for GPT Image generation and edits, retaining URL fallback
- Replaces Nano Banana 2 with Nano Banana 2.1 and adds 21:9
- Detects actual Nano Banana image formats and skips thought images; old workflows must reselect the model

### v1.4.1

- Adds URL-only download retries: 20 seconds per attempt, up to four attempts, 80 seconds including waits
- Preserves recoverable URLs and per-attempt diagnostics in execution errors
- Separates generation/download status and fixes locale-dependent CI sorting

### v1.4.0

- Adds GPT Image 2.5 Sunburst/Flare and their quality/background controls
- Accepts Base64 or URL images and outputs original URLs alongside Binary data
- Removes Nano Banana 1 Pro and Jimeng 5.0; existing workflows must reselect a model

### v1.3.8

- Replaces node and credential PNG icons with a consistent SVG logo
- Aligns CI and release automation with the repository's `main` branch

### v1.3.7

- Makes the credential API address selectable between `api.lmao.net.cn` and `ai.lmao.net.cn`
- Defaults new credentials to `ai.lmao.net.cn` while preserving existing saved credentials

### v1.3.6

- Preserves n8n item linking for all success and `continueOnFail` outputs

### v1.0.0 (2026-03-06)

- Initial LmaoAPI version
- Migrated from DeerAPI
- Model upgrades (Gemini 3.1, 即梦 5.0)
- All features retained (text, image, video, embeddings)

---

**Index Status:** ✅ Complete
**Last Updated:** 2026-10-21
**Maintainer:** 毛淞淮 (maosonghuai)
