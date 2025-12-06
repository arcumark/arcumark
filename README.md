# Arcumark

Arcumark is a browser-first timeline editor for video, audio, and text overlays. Everything is local: projects are stored in `localStorage`, media in IndexedDB, and exports render to WebM in the browser via `MediaRecorder` + `Canvas` + `AudioContext`. No uploads are required.

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

## Project layout

- `src/app` — routes (editor, export, projects, about, api routes for presets/timeline validation/advice/system health)
- `src/components` — shared UI shell
- `src/lib/shared` — timeline/preset types and validation
- `src/lib/client` — browser-side utilities (IndexedDB media store)
- `public` — static assets

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

```bash
pnpm install
pnpm dev
# app: http://localhost:3000
```

## Preview on Cloudflare (OpenNext)

```bash
pnpm preview
```

## Deploy

```bash
pnpm deploy
```

## Environment and requirements

- Modern Chromium-based browser recommended for `MediaRecorder`, `AudioContext`, and `canvas.captureStream`.
- Local-only storage; clearing browser data removes projects and media.
- Audio capture depends on browser support for `MediaStreamDestination` or `captureStream`; falls back to muted export if unavailable.

## License

- Arcumark is MIT licensed. See [`LICENSE`](./LICENSE) for details.
- Third-party notices live under `src/app/license` and `src/app/license/third-party`.
