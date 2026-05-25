# Clean-room rewrite — the behavioural spec

This is the behavioural specification the renderer in `mcp/frontend/` is being implemented against. **The renderer was not derived from any other open-source project.** It is original work by the maintainers of myind.ai, written from scratch using only:

1. The MCP server source under `mcp/src/` (which we authored).
2. The contract documented in [`architecture.md`](architecture.md).
3. Public documentation of three.js, the W3C Canvas 2D API, and the Playwright CDP interface.

This document exists to make that provenance auditable.

## Why this matters

The rebuild followed an explicit two-window protocol:

1. **Specification window:** read only `mcp/src/renderer/render.ts` and `mcp/src/renderer/browser.ts` to extract the contract — the four functions on `window.__mcp`, the shape of `RenderSpec`, the shape of `PresetCatalog`. Distill into this document.
2. **Implementation window:** write the renderer against the spec in this document. No reference to any other open-source renderer was permitted during implementation.

The work was scoped this way because earlier development experiments referenced `github.com/YUZU-Hub/appscreen` (which has no licence) and we wanted to ship the open-source release with an unambiguous provenance.

## Spec §1 — Contract surface

The renderer is a single static HTML page (`index.html`) loaded by Playwright over a `file://` URL. Its only contract with the rest of the system is the global `window.__mcp` object exposing four members:

1. `ready: Promise<void>` — resolves once the renderer has loaded fonts, primed three.js, and is ready to handle `applySpec`.
2. `applySpec(spec: RenderSpec): Promise<void>` — applies one render. Promise resolves when the canvas reflects the input.
3. `exportCanvasAsPng(): string` — returns a base64-encoded PNG of the current canvas state. Synchronous. Called immediately after `applySpec` resolves.
4. `listPresets(): PresetCatalog` — returns the renderer's static catalogue of available templates, gradients, modes, text positions, font families/weights, background types, image fits, device frames, and per-device canvas dimensions.

The shapes are documented in [`architecture.md`](architecture.md). Anything beyond these four functions is implementation detail and may change between releases.

## Spec §2 — Canvas conventions

- One `<canvas id="output">` element exists in the DOM at all times.
- The canvas dimensions are set per-render from `PresetCatalog.canvasDimensions[outputDevice]`. Default `1290 × 2796` (iPhone 6.7" App Store size) if no `outputDevice` is supplied.
- The canvas uses `2d` context for layout, text, and screenshot composition. A separate `<canvas id="three">` element rendered by three.js holds the device frame; its contents are drawn into the main canvas at composite time via `drawImage`.

## Spec §3 — Render pipeline (per `applySpec` call)

1. **Resize.** Set the main canvas to the dimensions implied by `outputDevice`.
2. **Background.** Paint the background according to `decision.background` (gradient name from preset catalogue → CSS gradient string → painted via `CanvasRenderingContext2D.createLinearGradient`).
3. **Device frame.** If a `.glb` device model is configured, render it via three.js into `<canvas id="three">` at the position/rotation derived from `positionPresetDetails[decision.positionPreset]`. If no `.glb` is available, draw a minimalist rounded-rectangle device shell directly in 2D (placeholder mode).
4. **Screenshot.** Composite the input screenshot (`decision.dataUrl`) onto the device frame's screen area.
5. **Text overlay.** Render `decision.headline` and `decision.subheadline` in `decision.fontFamily` / `decision.fontWeight` at the position derived from `decision.textPosition` and `decision.mode`.
6. **Laurel / info overlays.** If the template requests them, draw the relevant SVG icon at the configured spot.
7. **Promise resolution.** Resolve `applySpec`'s returned Promise.

## Spec §4 — Template registry

Templates are registered in a `TEMPLATES: Map<string, TemplateDef>` declared at the top of `app.js`. A `TemplateDef` is:

```ts
interface TemplateDef {
  name: string;            // catalogue key
  description?: string;    // optional human-readable note
  defaults: Partial<RenderSpec["decision"]>;
  render(spec: RenderSpec, ctx: CanvasRenderingContext2D, three: ThreeRenderer): Promise<void>;
}
```

`render` is responsible for the full pipeline of §3 for that template. Templates may override §3 steps as needed but should respect the contract.

v1.0.0-rc.1 ships exactly one template: `clean-minimal`.

Planned templates (v1.0.0-rc.2):

- `dark-premium` — dark background, light headline, accent-coloured subheadline
- `vibrant-gradient` — multi-stop background gradient, white text
- `big-number` — large hero stat at top, screenshot below
- `tilt` — perspective-tilted device frame

These will be brainstormed individually and added without breaking the contract.

## Spec §5 — Preset catalogue values

The `listPresets()` return value is hard-coded in `app.js`. Initial values (v1.0.0-rc.1):

```js
{
  contractVersion: 1,
  positionPresets: ["center", "top", "bottom", "tilt-left", "tilt-right"],
  positionPresetDetails: {
    "center":      { scale: 1.0, x: 0,    y: 0,    rotation: 0,    perspective: 0 },
    "top":         { scale: 0.9, x: 0,    y: -200, rotation: 0,    perspective: 0 },
    "bottom":      { scale: 0.9, x: 0,    y: 200,  rotation: 0,    perspective: 0 },
    "tilt-left":   { scale: 0.92, x: -50, y: 0,    rotation: -8,   perspective: 0.05 },
    "tilt-right":  { scale: 0.92, x: 50,  y: 0,    rotation: 8,    perspective: 0.05 }
  },
  gradientPresets: [
    { name: "sunset",  gradient: "linear-gradient(180deg, #ff8a00, #e52e71)" },
    { name: "ocean",   gradient: "linear-gradient(180deg, #00c6ff, #0072ff)" },
    { name: "forest",  gradient: "linear-gradient(180deg, #11998e, #38ef7d)" }
  ],
  modes: ["light", "dark"],
  textPositions: ["top", "bottom", "center"],
  fontFamilies: ["Inter", "Manrope", "Geist", "SF Pro Display"],
  fontWeights: ["400", "500", "600", "700", "800"],
  backgroundTypes: ["solid", "gradient", "blurred-screenshot"],
  imageFits: ["contain", "cover"],
  outputDevices: ["iphone-15-pro-max", "iphone-6.7", "google-pixel-8"],
  canvasDimensions: {
    "iphone-15-pro-max": { width: 1290, height: 2796 },
    "iphone-6.7":        { width: 1290, height: 2796 },
    "google-pixel-8":    { width: 1080, height: 2400 }
  }
}
```

This catalogue grows with each release; bump `contractVersion` only on breaking changes.

## Spec §6 — Error handling

- If `applySpec` is called with an invalid `decision.template`, the renderer throws `Error("unknown template: <name>")` synchronously (before the returned Promise resolves).
- If a font listed in `decision.fontFamily` is not loaded, the renderer falls back to the system default and logs `[mcp-debug] font fallback: <name>` to the page console (Playwright surfaces this to the server stderr).
- If the device `.glb` for `outputDevice` is not found, the renderer falls back to placeholder geometry (a rounded-rectangle device shell) and logs `[mcp-debug] device fallback: <name>`.

## Spec §7 — Three.js usage

three.js is loaded as an ES module from `https://cdn.jsdelivr.net/npm/three@0.<n>/build/three.module.js` (pinned to a specific minor for reproducibility). Used **only** for device-frame rendering — never for 2D primitives, text, or compositing, which all happen on the 2D canvas.

## Spec §8 — Out of scope for v1.0.0-rc.1

- Video rendering (returns to v1.1.0).
- Multi-page templates.
- Animated transitions.
- Server-side fonts (everything must load from the bundled `mcp/frontend/`).

## Audit trail

Every renderer commit message includes the form `renderer: <subsystem>: <change> (clean-room, from spec §<n>)`. If a future contributor needs to understand why a piece of renderer code looks the way it does, they can trace it back through this document.
