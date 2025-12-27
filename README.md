# Arcumark

Arcumark is a browser-first timeline editor for video, audio, and text overlays. Everything is local: projects are stored in `localStorage`, media in IndexedDB, and exports render to WebM in the browser via `MediaRecorder` + `Canvas` + `AudioContext`. No uploads are required.

**Now available as:**
- **Web App** - Browser-based editor (Next.js)
- **CLI Tool** - Command-line project management
- **MCP Server** - AI integration with Claude Desktop

## Highlights

- Project presets: pick resolution/fps presets, auto-apply them to the viewer, and reuse the last preset.
- Media library: import video/audio/image files into IndexedDB; durations are probed automatically for AV files.
- Timeline editing: drag-and-drop clips per track type (video/audio/text), snapping, copy/paste, per-track badges, delete with keyboard.
- Clip inspector: start/end, opacity/volume, text styling (font, size, stroke, anchor, alignment, rotation, line height, letter spacing).
- Viewer tools: transform (translate), crop (inset handles), distort (corner handles), text overlay rendering.
- Export: validate timeline, get structural advice, and render WebM locally with audio captured through `AudioContext` (muted to the user).

## Stack

- Next.js 15 (App Router), React 19
- Tailwind utility classes (no full framework)
- OpenNext Cloudflare tooling for preview/deploy

## Monorepo Structure

This project is organized as a **Bun Workspace**:

```
arcumark/
├── packages/
│   ├── shared/       # Shared types, validation, storage abstraction
│   ├── web/          # Next.js web application
│   ├── cli/          # Command-line interface
│   └── mcp/          # MCP server for AI integration
└── package.json      # Workspace root
```

### Package Details

**@arcumark/shared** - Core library
- Timeline, Track, Clip types
- Video preset definitions
- Storage adapters (File, SQLite, IndexedDB)
- Validation utilities

**@arcumark/web** - Web application
- Multi-track timeline editor
- Media library management
- Real-time preview with Canvas
- Export to WebM

**@arcumark/cli** - CLI tool
- Project management (create, list, delete)
- Timeline validation
- File or SQLite storage

**@arcumark/mcp** - MCP server
- Project management tools
- Timeline operations
- Integration with Claude Desktop

## Data storage

- Projects: `localStorage` key `arcumark:timeline:{projectId}` (validated on load).
- Media: IndexedDB database `arcumark-media`, store `media`; records include blob, duration, type, and name.
- Recent preset: `localStorage` key `arcumark:lastPreset`.

## Export pipeline

1. Load timeline from `localStorage` and media blobs from IndexedDB.
2. Validate timeline and optionally fetch advice via `/api/timeline/validate` and `/api/timeline/advice`.
3. Render frames on a hidden canvas at the preset resolution/fps; draw video/image with crop/transform, then text overlays.
4. Capture canvas video and audio (via `AudioContext` + `MediaStreamDestination`) into `MediaRecorder` as WebM (VP9/Opus when available).
5. Provide a download URL when recording completes. Audio is muted locally but captured in the output.

## Development

### Initial Setup

```bash
# Install all dependencies
bun install

# Build shared package (required first)
cd packages/shared && bun run build

# Build CLI (optional)
cd ../cli && bun run build

# Build MCP (optional)
cd ../mcp && bun run build
```

### Web Development

```bash
# Run web development server
bun run dev
# or
cd packages/web && bun run dev
# app: http://localhost:3000
```

### CLI Usage

```bash
# After building CLI package
cd packages/cli
bun link  # Install globally

# Then use anywhere:
arcumark project create -n "My Project"
arcumark project list
```

### MCP Server

Add to Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "arcumark": {
      "command": "bun",
      "args": ["/path/to/arcumark/packages/mcp/src/index.ts"]
    }
  }
}
```

## Preview on Cloudflare (OpenNext)

```bash
bun preview
```

## Deploy

```bash
bun deploy
```

## Environment and requirements

- Modern Chromium-based browser recommended for `MediaRecorder`, `AudioContext`, and `canvas.captureStream`.
- Local-only storage; clearing browser data removes projects and media.
- Audio capture depends on browser support for `MediaStreamDestination` or `captureStream`; falls back to muted export if unavailable.

## License

- Arcumark is MIT licensed. See [`LICENSE`](./LICENSE) for details.
- Third-party notices live under `src/app/license` and `src/app/license/third-party`.
