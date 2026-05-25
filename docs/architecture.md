# Architecture

This document describes the boundaries between the components and the contract between server and renderer. Read this before contributing.

## Overview

```
┌─ MCP client (Claude Desktop / Code / Cursor / Windsurf) ──────────┐
│  Speaks JSON-RPC over stdio.                                      │
└──────────────────────┬────────────────────────────────────────────┘
                       │ stdio
                       ▼
┌─ myindai-screenshot-mcp (Node + TypeScript) ──────────────────────┐
│  mcp/src/server.ts          ← registers tools, schemas, prompts   │
│  mcp/src/tools/*.ts         ← per-tool implementations            │
│  mcp/src/renderer/*.ts      ← Playwright driver + render contract │
│  mcp/src/video/*.ts         ← ffmpeg pipeline (v1.1.0+)           │
│  mcp/src/ai/*.ts            ← Anthropic Vision wrappers           │
└──────────────────────┬────────────────────────────────────────────┘
                       │ Playwright (CDP)
                       ▼
┌─ headless Chromium ───────────────────────────────────────────────┐
│  mcp/frontend/index.html    ← canvas + DOM scaffold               │
│  mcp/frontend/app.js        ← exposes window.__mcp                │
│  mcp/frontend/three-renderer.js ← 3D device shells (three.js)     │
│  mcp/frontend/styles.css                                          │
│  mcp/frontend/img/*.svg     ← UI overlays (laurel, info icon)     │
│  mcp/frontend/models/*.glb  ← 3D device geometry                  │
└───────────────────────────────────────────────────────────────────┘
```

## Components

### `mcp/` — the MCP server

A Node + TypeScript process speaking JSON-RPC over stdio. Each tool is one file under `src/tools/`. Tools that need to render an image call into `src/renderer/render.ts`, which spawns a single headless Chromium page via Playwright and reuses it across renders. The page is shut down after `IDLE_SHUTDOWN_MS` of inactivity (default 60s) to release memory.

### `mcp/frontend/` — the headless renderer

A single static HTML page loaded over a `file://` URL by Playwright. Its only public surface is the `window.__mcp` object documented below — nothing else is contract. The renderer is **deliberately framework-free** (vanilla ES modules + DOM API + three.js) so the published npm package stays tiny and self-contained.

## The server → renderer contract

The renderer **must** expose four functions on `window.__mcp`:

```ts
interface McpRendererContract {
  /**
   * Promise that resolves when the renderer is ready to receive specs.
   * MUST resolve before the server attempts the first applySpec call.
   */
  ready: Promise<void>;

  /**
   * Apply a render specification. Server calls this exactly once per render.
   * On success, the canvas reflects the new render. On failure, throws
   * (Playwright surfaces it as a page-level rejection).
   */
  applySpec(spec: RenderSpec): Promise<void>;

  /**
   * Synchronously export the current canvas as a base64-encoded PNG.
   * Called immediately after applySpec resolves.
   */
  exportCanvasAsPng(): string;

  /**
   * Return the catalogue of templates / presets / fonts / devices the
   * renderer supports. Used by list_presets and by tools that need to
   * validate inputs before calling applySpec.
   */
  listPresets(): PresetCatalog;
}
```

```ts
interface RenderSpec {
  dataUrl: string;            // input app screenshot as data: URL
  name?: string;              // for telemetry/debug only
  language?: string;          // BCP-47 locale; "en", "fr", "ja", …
  outputDevice?: string;      // device frame key from PresetCatalog.outputDevices
  decision: {
    template: string;         // template key from PresetCatalog
    headline?: string;
    subheadline?: string;
    brandColor?: string;      // CSS color
    background?: string;      // gradient name or hex color
    textPosition?: string;    // PresetCatalog.textPositions
    mode?: string;            // PresetCatalog.modes
    fontFamily?: string;
    fontWeight?: string;
    // Tool-specific extensions are allowed; renderer ignores unknown keys.
    [key: string]: unknown;
  };
}
```

```ts
interface PresetCatalog {
  contractVersion: number;       // bump in renderer when this shape changes
  positionPresets: string[];
  positionPresetDetails: Record<string, {
    scale: number; x: number; y: number; rotation: number; perspective: number;
  }>;
  gradientPresets: { name: string; gradient: string }[];
  modes: string[];
  textPositions: string[];
  fontFamilies: string[];
  fontWeights: string[];
  backgroundTypes: string[];
  imageFits: string[];
  outputDevices: string[];
  canvasDimensions: Record<string, { width: number; height: number }>;
}
```

## Why this contract

Five reasons it's worth preserving across renderer rewrites:

1. **Stateless from the server's perspective.** Every render is `applySpec` then `exportCanvasAsPng`; nothing else accumulates state across renders.
2. **Single source of truth for presets.** The server doesn't hard-code template lists; it asks the renderer at startup via `listPresets`. Adding a new template is purely a renderer change.
3. **Easy to test in isolation.** Open `mcp/frontend/index.html` in a browser, paste a JSON `spec` into the dev console, see the result. No Node process required.
4. **Forward-compatible.** `decision` is open-ended; new tools can pass new keys without bumping `contractVersion`. Breaking changes bump it.
5. **Replaceable.** This is exactly the contract that enabled the v1.0.0-rc.1 clean-room rewrite — and it's what would let someone fork only the renderer to ship a competing implementation.

## Adding a new tool

1. Create `mcp/src/tools/<tool>.ts`. Export a `register(server)` function that calls `server.tool(...)`.
2. Import and call `register` from `mcp/src/server.ts`.
3. If the tool renders, build the `RenderSpec` and call `await render(input)` from `mcp/src/renderer/render.ts`.
4. Add a row to the tools table in `README.md`.
5. Add a smoke case to `mcp/scripts/smoke.ts`.

## Adding a new template

1. In `mcp/frontend/app.js`, add a new entry to `TEMPLATES` with: `name`, `render(spec, canvasCtx, threeRenderer)`, optional preset overrides.
2. The template's `render` function is responsible for painting the canvas (and optionally the WebGL device frame).
3. Add the template name to `listPresets()` so the server discovers it.
4. No server code change needed.

## Adding a new device frame

1. Acquire a `.glb` file with a clean licence (see [ASSETS.md](../ASSETS.md) for the provenance rules).
2. Drop it under `mcp/frontend/models/<device>.glb`.
3. Register it in `mcp/frontend/three-renderer.js` `DEVICE_MODELS` map.
4. Add the device key to `listPresets().outputDevices` and `listPresets().canvasDimensions`.
5. No server code change needed.

## File-size budgets

See [CONTRIBUTING.md](../CONTRIBUTING.md#file-size-budgets).
