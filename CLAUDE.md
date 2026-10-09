# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an n8n community node package that provides integration with LmaoAPI (https://api.lmao.net.cn). It enables users to call AI models through n8n workflows without manually configuring HTTP Request nodes.

**Key Features:**
- Text generation with multimodal support (text + images)
- Image generation (GPT-Image-2.5 Sunburst, GPT-Image-2.5 Flare, GPT-Image-2, Nano Banana 2.1)
- Audio transcription (qwen3.5-omni-flash; MP4/M4A AAC input, timestamped Markdown text output)
- GPT Image Base64/URL responses converted to Binary, with original URLs in `json.imageUrl`
- Cross-node Binary data reading

## Development Commands

```bash
# Build the node (compiles TypeScript to dist/)
npm run build

# Watch mode for development
npm run build:watch

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Development mode with n8n
npm run dev

# GitHub release only; npm publishing is manual (uses release-it)
npm run release
```

When the package version is already updated, use `npm run release -- --no-increment` (uses the version already in package.json). The release configuration disables npm publishing and npm authentication checks; the maintainer runs `npm publish` separately.

## Architecture

### File Structure

- `credentials/MaibaoApi.credentials.ts` - Credential definition (API Key + Base URL)
- `nodes/MaibaoApi/MaibaoApi.node.ts` - Main node implementation
- `nodes/MaibaoApi/audio/` - AAC extraction, M4A chunking, concurrent transcription and Markdown output; legacy Whisper backend retained
- `dist/` - Compiled output (published to npm)

### Core Components

**MaibaoApi Node** (`nodes/MaibaoApi/MaibaoApi.node.ts`):
- Implements `INodeType` interface from n8n-workflow
- Exposes 3 modes: text, image, audio; video and embeddings remain hidden
- Handles Binary data collection from current or specified nodes
- Automatic image extraction and Base64 conversion

**Key Functions:**
- `collectBinaryFromNodes()` - Collects Binary data from current input or specified upstream nodes, pre-reads file system binaries
- `extractImagesFromBinary()` - Extracts image data from Binary properties, converts to Base64

### API Integration

**Base URLs:**
- Default API: `https://ai.lmao.net.cn/v1`
- Alternative API: `https://api.lmao.net.cn/v1`
- Sora API: selected API domain with the `/v1` suffix removed

**Endpoints:**
- Text: `POST /v1/chat/completions`
- Image (Gemini): `POST /v1beta/models/{model}:generateContent`
- Image (GPT Image): `POST /v1/images/generations`, multipart `POST /v1/images/edits`
- Audio: `POST /v1/chat/completions`; legacy Whisper backend uses `POST /v1/audio/transcriptions`
- Video (hidden): `POST /v1/videos`, `GET /v1/videos/{id}`, etc.
- Embeddings (hidden): `POST /v1/embeddings`

GPT Image generation and edit requests always send `response_format: 'b64_json'`; URL fallback remains supported. Nano Banana 2.1 uses `gemini-nano-banana-2.1-preview`, 14 aspect ratios including 21:9, and 1K/2K/4K; old Nano Banana 2 workflows must reselect the model.

GPT Image model values map to their corresponding `-c` provider IDs. Only the two 2.5 models expose `xhigh`/`max` quality and background settings. Transparent backgrounds require PNG or WebP. Nano Banana 1 Pro and Jimeng 5.0 have been removed; existing workflows using them fail before a generation request and must reselect a model.

### Binary Data Handling

The node supports two Binary source modes:
1. **Current node input** - Uses `context.getInputData()` and `getBinaryDataBuffer()`
2. **Specified nodes** - Uses `context.getWorkflowDataProxy()` to access upstream nodes by name, pre-reads file system binaries using `getBinaryStream()` and `binaryToBuffer()`

When collecting from specified nodes, the function pre-reads Binary data stored in the file system (identified by `binaryData.id`) to avoid context issues when accessing cross-node data.

### Video Generation (Sora 2, hidden)

- Supports storyboard mode with multiple shots
- Smart polling: checks video status every 15 seconds (max 10 minutes)
- Reference image support via Binary input
- Operations: create, remix, retrieve, download, list

## GPT Image Download Recovery

Use GptImageDownload for result URLs: 20 seconds per GET, at most four attempts, and 80 seconds including waits. Generation is not retried. Preserve safe diagnostics and recovery URLs in NodeOperationError.context.imageDownload and continueOnFail output. Do not log raw Axios errors or signed URLs. Whole-node retryOnFail can still repeat generation.

## Code Style

- Uses tabs for indentation (tabWidth: 2)
- Single quotes for strings
- Trailing commas
- Print width: 100 characters
- Strict TypeScript configuration

## Testing & CI

CI runs on GitHub Actions (.github/workflows/ci.yml):
- Node.js 24
- Runs `npm ci`, `npm run lint`, `npm run build`, `npm test`
- Triggers on pull requests and pushes to `main`

Run `npm run build` followed by `npm test` locally to execute the regression suite, including image model configuration, Base64/URL responses and node execution.

## Important Notes

- The node is marked as `usableAsTool: true` for AI agent integration
- Supports n8n API version 1 (`n8nNodesApiVersion: 1`)
- When reading Binary from specified nodes, always use the pre-read `bufferMap` to avoid file system access issues
- Image properties default to: `data, data0, data1, data2, data3, data4, data5`
- Maximum 10 images supported for text/image generation
- Video download timeout: 300 seconds (5 minutes)
