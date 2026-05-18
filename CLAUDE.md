# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an n8n community node package that provides integration with LmaoAPI (https://api.lmao.net.cn). It enables users to call AI models through n8n workflows without manually configuring HTTP Request nodes.

**Key Features:**
- Text generation with multimodal support (text + images)
- Image generation (Gemini models, 即梦 5.0)
- Video generation (Sora 2)
- Vector embeddings
- Automatic Base64 conversion for images
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

# Release (uses release-it)
npm run release
```

## Architecture

### File Structure

- `credentials/MaibaoApi.credentials.ts` - Credential definition (API Key + Base URL)
- `nodes/MaibaoApi/MaibaoApi.node.ts` - Main node implementation
- `dist/` - Compiled output (published to npm)

### Core Components

**MaibaoApi Node** (`nodes/MaibaoApi/MaibaoApi.node.ts`):
- Implements `INodeType` interface from n8n-workflow
- Supports 4 modes: text, image, video, embeddings
- Handles Binary data collection from current or specified nodes
- Automatic image extraction and Base64 conversion

**Key Functions:**
- `collectBinaryFromNodes()` - Collects Binary data from current input or specified upstream nodes, pre-reads file system binaries
- `extractImagesFromBinary()` - Extracts image data from Binary properties, converts to Base64

### API Integration

**Base URLs:**
- Standard API: `https://api.lmao.net.cn/v1`
- Sora API: `https://api.lmao.net.cn` (v1 suffix removed)

**Endpoints:**
- Text: `POST /v1/chat/completions`
- Image (Gemini): `POST /v1beta/models/{model}:generateContent`
- Image (即梦): `POST /v1/images/generations`
- Video: `POST /v1/videos`, `GET /v1/videos/{id}`, etc.
- Embeddings: `POST /v1/embeddings`

### Binary Data Handling

The node supports two Binary source modes:
1. **Current node input** - Uses `context.getInputData()` and `getBinaryDataBuffer()`
2. **Specified nodes** - Uses `context.getWorkflowDataProxy()` to access upstream nodes by name, pre-reads file system binaries using `getBinaryStream()` and `binaryToBuffer()`

When collecting from specified nodes, the function pre-reads Binary data stored in the file system (identified by `binaryData.id`) to avoid context issues when accessing cross-node data.

### Video Generation (Sora 2)

- Supports storyboard mode with multiple shots
- Smart polling: checks video status every 15 seconds (max 10 minutes)
- Reference image support via Binary input
- Operations: create, remix, retrieve, download, list

## Code Style

- Uses tabs for indentation (tabWidth: 2)
- Single quotes for strings
- Trailing commas
- Print width: 100 characters
- Strict TypeScript configuration

## Testing & CI

CI runs on GitHub Actions (.github/workflows/ci.yml):
- Node.js 22
- Runs `npm ci`, `npm run lint`, `npm run build`
- Triggers on pull requests and pushes to main branch

## Important Notes

- The node is marked as `usableAsTool: true` for AI agent integration
- Supports n8n API version 1 (`n8nNodesApiVersion: 1`)
- When reading Binary from specified nodes, always use the pre-read `bufferMap` to avoid file system access issues
- Image properties default to: `data, data0, data1, data2, file, attachment`
- Maximum 3 images supported for text/image generation
- Video download timeout: 300 seconds (5 minutes)
