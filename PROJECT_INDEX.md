# Project Index: n8n-nodes-lmaoapi

**Generated:** 2026-03-08
**Version:** 1.3.3
**Type:** n8n Community Node Package

---

## 📁 Project Structure

```
n8n-nodes-lmaoapi/
├── credentials/
│   └── MaibaoApi.credentials.ts    # API credential definition
├── nodes/
│   └── MaibaoApi/
│       ├── MaibaoApi.node.ts       # Main node implementation (713 lines)
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

**Total Source Code:** 736 lines (TypeScript)

---

## 🚀 Entry Points

### Main Node

- **Path:** `nodes/MaibaoApi/MaibaoApi.node.ts`
- **Class:** `MaibaoApi implements INodeType`
- **Purpose:** n8n node for LmaoAPI integration (text, image, video, embeddings)

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
2. **Image Generation** - Gemini models (3.1 Flash, 3 Pro) + 即梦 5.0
3. **Video Generation** - Sora 2 with storyboard mode, smart polling
4. **Embeddings** - text-embedding-3-large/small

**Key Features:**

- Cross-node Binary data reading (via `workflowDataProxy`)
- Automatic Base64 conversion for images (max 3 images)
- Pre-reading file system binaries to avoid context issues
- Smart polling for video generation (15s intervals, 10min max)
- Storyboard mode for multi-shot video creation

### MaibaoApi Credentials (`credentials/MaibaoApi.credentials.ts`)

**Exports:** `MaibaoApi` class
**Implements:** `ICredentialType` from `n8n-workflow`

**Properties:**

- `apiKey` - API authentication key (password field)
- `baseUrl` - API base URL (default: `https://api.lmao.net.cn/v1`)

---

## 🔧 Configuration Files

### package.json

- **Name:** `n8n-nodes-lmaoapi`
- **Version:** 1.3.3
- **License:** MIT
- **n8n API Version:** 1
- **Node Entry:** `dist/nodes/MaibaoApi/MaibaoApi.node.js`
- **Credential Entry:** `dist/credentials/MaibaoApi.credentials.js`

### tsconfig.json

- **Target:** ES2019
- **Module:** CommonJS
- **Strict Mode:** Enabled
- **Output:** `dist/`
- **Includes:** `credentials/**/*`, `nodes/**/*`

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

### README.md (7.6KB)

- **Language:** Chinese
- **Content:** User guide, features, installation, usage examples
- **Sections:** Why, Features, Installation, Usage, Version History, Disclaimer

### CLAUDE.md (3.8KB)

- **Purpose:** Guidance for Claude Code instances
- **Content:** Architecture, dev commands, API integration, Binary handling

### CHANGELOG.md (1.3KB)

- **Latest:** v1.0.0 (2026-03-06)
- **Changes:** Migration from DeerAPI to LmaoAPI, model upgrades

### LICENSE.md (1KB)

- **Type:** MIT License

---

## 🧪 CI/CD

### GitHub Actions (`.github/workflows/ci.yml`)

- **Triggers:** Pull requests, pushes to main branch
- **Node Version:** 22
- **Steps:**
  1. Install dependencies (`npm ci`)
  2. Run linter (`npm run lint`)
  3. Build project (`npm run build`)

**No test files present** - Project relies on manual testing in n8n

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
npm run release         # Create new release (uses release-it)
```

### Installation in n8n

```bash
npm install n8n-nodes-lmaoapi
```

Or install via n8n Community Nodes UI.

---

## 🎯 API Integration

### Base URLs

- **Standard API:** `https://api.lmao.net.cn/v1`
- **Sora API:** `https://api.lmao.net.cn` (v1 suffix removed)

### Endpoints

- **Text:** `POST /v1/chat/completions`
- **Image (Gemini):** `POST /v1beta/models/{model}:generateContent`
- **Image (即梦):** `POST /v1/images/generations`
- **Video Create:** `POST /v1/videos`
- **Video Retrieve:** `GET /v1/videos/{id}`
- **Video Download:** `GET /v1/videos/{id}/content`
- **Video List:** `GET /v1/videos`
- **Embeddings:** `POST /v1/embeddings`

### Supported Models

**Text Generation:**

- `gemini-3.1-pro-preview` (default)
- Custom model IDs supported

**Image Generation:**

- `gemini-3.1-flash-image-preview` (Nano Banana 2) - 13 aspect ratios
- `gemini-3-pro-image-preview` (Nano Banana 1 Pro) - 9 aspect ratios
- `doubao-seedream-5-0-260128` (即梦 5.0) - 2K/3K resolution

**Video Generation:**

- `sora-2-all` (Sora 2)
- `sora-2-pro-all` (Sora 2 Pro)

**Embeddings:**

- `text-embedding-3-large` (default)
- `text-embedding-3-small`

---

## 💡 Key Implementation Details

### Binary Data Handling

- **Two modes:** Current node input OR specified upstream nodes
- **Pre-reading:** File system binaries pre-read using `getBinaryStream()` + `binaryToBuffer()`
- **Default properties:** `data, data0, data1, data2, file, attachment`
- **Max images:** 3 for text/image generation, 1 for video reference

### Video Generation Features

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

## 📊 Token Efficiency

**Index Size:** ~3KB (this file)
**Full Codebase:** ~736 lines TypeScript
**Estimated Full Read:** ~15,000 tokens
**Index Read:** ~2,000 tokens
**Savings:** ~87% token reduction per session

---

## 🔄 Version History

### v1.0.2 (Current)

- Latest stable release

### v1.0.0 (2026-03-06)

- Initial LmaoAPI version
- Migrated from DeerAPI
- Model upgrades (Gemini 3.1, 即梦 5.0)
- All features retained (text, image, video, embeddings)

---

**Index Status:** ✅ Complete
**Last Updated:** 2026-03-08
**Maintainer:** 毛淞淮 (maosonghuai)
