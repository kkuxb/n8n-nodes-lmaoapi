# Project Index: n8n-nodes-lmaoapi

**Generated:** 2026-09-13
**Version:** 1.4.1
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

**Total Source Code:** 2056 lines across 6 TypeScript files

---

## 🚀 Entry Points

### Main Node

- **Path:** `nodes/MaibaoApi/MaibaoApi.node.ts`
- **Class:** `MaibaoApi implements INodeType`
- **Purpose:** n8n node for LmaoAPI integration (text, image, audio)

### Credentials

- **Path:** `credentials/MaibaoApi.credentials.ts`
- **Class:** `MaibaoApi implements ICredentialType`
- **Purpose:** API Key + Base URL credential definition

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
2. **Image Generation** - GPT-Image-2.5 Sunburst, GPT-Image-2.5 Flare, GPT-Image-2, Nano Banana 2
3. **Audio Transcription** - Whisper-1

Video and embeddings code remains in the repository but is hidden from the public node interface.

**Key Features:**

- Cross-node Binary data reading (via `workflowDataProxy`)
- Automatic Base64 conversion for images (max 10 images)
- Pre-reading file system binaries to avoid context issues
- GPT Image Base64/URL responses produce Binary data; original URLs also appear in `json.imageUrl`
- GPT Image 2.5 quality and background controls

### MaibaoApi Credentials (`credentials/MaibaoApi.credentials.ts`)

**Exports:** `MaibaoApi` class
**Implements:** `ICredentialType` from `n8n-workflow`

**Properties:**

- `apiKey` - API authentication key (password field)
- `lmaoBaseUrl` - Selectable API base URL (`api.lmao.net.cn` or `ai.lmao.net.cn`; AI is the default)

---

## 🔧 Configuration Files

### package.json

- **Name:** `n8n-nodes-lmaoapi`
- **Version:** 1.4.1
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

- **Latest:** v1.4.1 (2026-09-13)
- **Changes:** Bounded image download retries, failure recovery and diagnostics, cross-locale CI fix

### LICENSE.md

- **Type:** MIT License

---

## 🧪 CI/CD

### GitHub Actions (`.github/workflows/ci.yml`)

- **Triggers:** Pull requests, pushes to the `main` branch
- **Node Version:** 24
- **Steps:**
  1. Install dependencies (`npm ci`)
  2. Run linter (`npm run lint`)
  3. Build and run regression tests (`npm test`)

**Regression tests:** After building, `npm test` runs all test files, including GPT Image model configuration, response handling and node execution. CI runs lint and the full build/test suite.

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

- **Default API:** `https://ai.lmao.net.cn/v1`
- **Alternative API:** `https://api.lmao.net.cn/v1`
- **Sora API:** selected API domain with the `/v1` suffix removed

### Endpoints

- **Text:** `POST /v1/chat/completions`
- **Image (Gemini):** `POST /v1beta/models/{model}:generateContent`
- **Image (GPT Image):** `POST /v1/images/generations` or multipart `POST /v1/images/edits`
- **Audio:** `POST /v1/audio/transcriptions`
The following endpoints belong to hidden modes:

- **Video Create:** `POST /v1/videos`
- **Video Retrieve:** `GET /v1/videos/{id}`
- **Video Download:** `GET /v1/videos/{id}/content`
- **Video List:** `GET /v1/videos`
- **Embeddings (hidden):** `POST /v1/embeddings`

### Supported Models

**Text Generation:**

- `gpt-5.6-sol` (default)
- Custom model IDs supported

**Image Generation (dropdown order):**

1. `gpt-image-2.5-sunburst` → `gpt-image-2.5-sunburst-c`
2. `gpt-image-2.5-flare` → `gpt-image-2.5-flare-c`
3. `gpt-image-2` → `gpt-image-2-c` (default)
4. `gemini-3.1-flash-image-preview` (Nano Banana 2) - 13 aspect ratios, 1K/2K/4K

Only the two 2.5 models expose 超高 (`xhigh`), 最高 (`max`) and background settings. Transparent backgrounds require PNG or WebP. Compression and response-format selectors are not exposed. URL responses are downloaded automatically; Base64 takes priority if both fields are present, with the URL preserved.

Nano Banana 1 Pro and Jimeng 5.0 were removed. Existing workflows using them must select a supported model; otherwise execution fails before sending a generation request.

**Audio Transcription:** `whisper-1`

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

### v1.4.1 (Current)

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
**Last Updated:** 2026-09-13
**Maintainer:** 毛淞淮 (maosonghuai)
