# Tools reference — `myindai-screenshot-mcp`

The server exposes **25 tool surfaces** to your MCP client. This document is the complete reference: what each tool does, its inputs/outputs, current implementation status, and a copy-pastable example call. For the workflow-oriented guide (when to use which), see [`skills/myindai-screenshot/SKILL.md`](skills/myindai-screenshot/SKILL.md).

## Status legend

| Symbol | Meaning |
|---|---|
| ✅ **Working** | Implemented end-to-end in v1.0.0-rc.2. Use freely. |
| 🟡 **Stub** | Tool surface registered; the renderer / vision layer for it lands in a later rc. Calling it returns a structured "not yet implemented in rc.2" error. |
| 🔒 **Gated** | Needs `ANTHROPIC_API_KEY` env var **or** an MCP client that advertises `sampling` capability. v1.0.0-rc.2 ships [sampling-first](docs/llm-strategy.md); the env var is only an escape hatch. |

## Quick map

| Status | Tool | One-liner |
|---|---|---|
| ✅ | `render_screenshot` | Single App Store screenshot from one input. |
| ✅ | `list_presets` | Catalogue of templates, gradients, modes, devices. |
| ✅ | `list_assets` | Local asset library (decorations, accent shapes, tints). |
| ✅ | `get_asset` | Fetch a single asset's bytes by ID. |
| ✅ | `list_video_templates` | Video template catalogue (for v1.1.0 video tools). |
| ✅ | `memory_read` | Per-app design memory: brand kit, voice, last template. |
| ✅ | `memory_write` | Persist design memory across sessions. |
| ✅ | `record_telemetry` | Log a render's template/colour/headline for later analysis. |
| ✅ | `list_telemetry` | Query the telemetry log. |
| ✅ | `--doctor` (CLI) | Environment health check. |
| 🟡🔒 | `generate_screenshot` | LLM picks creative settings + renders. Lands rc.2 ↦ via sampling. |
| 🟡 | `render_aso_set` | Full 6-shot App Store set. Lands rc.2. |
| 🟡 | `render_ab_variants` | N variants for A/B testing. Lands rc.2. |
| 🟡 | `render_multi_size` | All required App Store sizes in one call. Lands rc.2. |
| 🟡🔒 | `render_localized_set` | One command → N languages, locale-aware fonts. Lands rc.2. |
| 🟡 | `render_play_store_set` | Play Store aspect ratios + constraints. Lands rc.2. |
| 🟡 | `make_showcase` | Showcase grid for portfolio / case studies. Lands rc.2. |
| 🟡🔒 | `pick_brand_color` | Vision-derived brand colour from the input. Lands rc.3. |
| 🟡🔒 | `extract_palette` | Multi-stop palette extraction. Lands rc.3. |
| 🟡🔒 | `suggest_headlines` | Vision-driven headline suggestions. Lands rc.3. |
| 🟡🔒 | `detect_empty_state` | Detect screenshots that need empty-state copy. Lands rc.3. |
| 🟡🔒 | `clone_reference` | Clone a competitor screenshot's style. Lands rc.3. |
| 🟡 | `render_video` | Product video from screenshots + script. Lands v1.1.0. |
| 🟡 | `render_video_template` | Named video template (cinematic, carousel, orbit). Lands v1.1.0. |
| 🟡🔒 | `render_video_concept` | LLM-driven video concept → video. Lands v1.1.0. |
| 🟡🔒 | `auto_video` | One-shot: screenshots → finished video. Lands v1.1.0. |

---

# Tool-by-tool reference

## ✅ `render_screenshot` — single App Store screenshot

The flagship tool. Takes one input screenshot, returns one polished output.

**Input shape:**

```ts
{
  image: string,              // absolute path | data: URL | raw base64 (raw phone-screen UI)
  reference_image?: string,   // optional reference template path (informational)
  headline?: string,          // 2–7 words, benefit-driven
  subheadline?: string,
  mode?: "2d" | "3d",         // device frame style. v1.0.0-rc.2 defaults to 2D placeholder geometry.
  position_preset?: "centered" | "bleed-bottom" | "bleed-top" | "float-center"
                  | "tilt-left" | "tilt-right" | "perspective" | "float-bottom",
  background_preset?: string, // gradient name; see myindai://presets
  accent_color?: string,      // hex
  text_color?: "light" | "dark",
  language?: string,          // BCP-47, default "en"
  output_device?: "iphone-6.9" | "iphone-6.7" | "iphone-6.5" | "iphone-5.5",
  output_path?: string,       // if set, writes PNG and returns the path
  // Advanced overrides (rare):
  background?: { type, gradient | solid | image, overlayColor, overlayOpacity, blur, noise, noiseIntensity },
  screenshot?: { scale, x, y, rotation, perspective, cornerRadius, use3D, device3D, rotation3D },
  text?: { fontFamily, fontWeight, /* … */ }
}
```

**Output:**

```ts
{ image_base64?: string, path?: string, decisions: { … } }
```

**Example (Claude calling the MCP tool):**

```jsonc
{
  "tool": "render_screenshot",
  "input": {
    "image": "/Users/alice/myapp/raw/01_home.png",
    "headline": "Track every habit",
    "subheadline": "Build streaks. Stay accountable.",
    "background_preset": "ocean",
    "text_color": "light",
    "position_preset": "centered",
    "output_path": "/Users/alice/myapp/marketing/01_home_polished.png"
  }
}
```

**2D vs 3D mode:**

- `mode: "2d"` (default) — fast, flat. v1.0.0-rc.2 uses a runtime-generated rounded-rectangle device shell (no `.glb` model). Sub-second render. Use this for everything in rc.2.
- `mode: "3d"` — landing in v1.0.0-rc.3 with real `.glb` device frames (iPhone 15 Pro Max, Samsung Galaxy S25 Ultra). The `screenshot.use3D`, `screenshot.device3D`, `screenshot.rotation3D` fields are reserved for that release.

## ✅ `list_presets` — catalogue of templates and presets

Returns everything the renderer can produce. Call this first when a user opens a new design conversation.

**Output:**

```jsonc
{
  "contractVersion": 1,
  "positionPresets": ["center", "top", "bottom", "tilt-left", "tilt-right"],
  "gradientPresets": [
    { "name": "ocean",  "gradient": "linear-gradient(180deg, #00c6ff, #0072ff)" },
    { "name": "sunset", "gradient": "linear-gradient(180deg, #ff8a00, #e52e71)" },
    { "name": "forest", "gradient": "…" },
    { "name": "violet", "gradient": "…" },
    { "name": "peach",  "gradient": "…" }
  ],
  "modes": ["light", "dark"],
  "textPositions": ["top", "bottom", "center"],
  "fontFamilies": ["Inter", "Manrope", "system-ui"],
  "fontWeights": ["400", "500", "600", "700", "800"],
  "backgroundTypes": ["solid", "gradient", "blurred-screenshot"],
  "imageFits": ["contain", "cover"],
  "outputDevices": ["iphone-15-pro-max", "iphone-6.7", "google-pixel-8"],
  "canvasDimensions": {
    "iphone-15-pro-max": { "width": 1290, "height": 2796 },
    "iphone-6.7":        { "width": 1290, "height": 2796 },
    "google-pixel-8":    { "width": 1080, "height": 2400 }
  }
}
```

## ✅ `list_assets` / `get_asset`

`list_assets` returns the bundled asset library — accent shapes, decorations, device tints, patterns. Each entry has an `id`. `get_asset(id)` returns the raw bytes (or data URL) for a specific asset. v1.0.0-rc.2 ships with placeholder geometry only; real SVG / .glb assets land in v1.0.0-rc.3 with documented provenance ([`ASSETS.md`](ASSETS.md)).

## ✅ `memory_read` / `memory_write` — per-app design memory

Typed JSON store under `~/.myindai-screenshot-mcp/memory/<namespace>.json`. Lets Claude remember a user's brand kit, voice, and last-used template across sessions.

```jsonc
// memory_write
{ "namespace": "myapp",
  "value": {
    "brand": { "primary": "#0072ff", "voice": "calm, confident" },
    "last_template": "clean-minimal",
    "last_background": "ocean"
  } }
```

```jsonc
// memory_read
{ "namespace": "myapp" }
// → { "value": { ... } }
```

Override the on-disk location with `MCP_MEMORY_DIR`.

## ✅ `record_telemetry` / `list_telemetry`

Optional JSONL log under `~/.myindai-screenshot-mcp/telemetry/<app_id>.jsonl`. Use to correlate (template, colour, headline) → (impressions, installs, conversion rate) over time. Useful for the ASO consultant workflow described in the skill.

## ✅ CLI: `--doctor`, `--version`, `--help`

```bash
npx -y myindai-screenshot-mcp --doctor
npx -y myindai-screenshot-mcp --version
npx -y myindai-screenshot-mcp --help
```

The doctor reports node version, platform, PATH visibility, sampling status, and ffmpeg/ffprobe resolution. It's the first thing to run when something feels off.

## 🟡 `render_aso_set`, `render_ab_variants`, `render_multi_size`, `render_play_store_set`, `make_showcase`

These set-level tools all wrap `render_screenshot` with batched logic. **They register in `tools/list` but return a structured "coming in v1.0.0-rc.2" error in rc.2.** When they land:

- `render_aso_set` — 6 screenshots, distinct copy + colour per slot.
- `render_ab_variants` — N variants of the same screenshot for A/B testing.
- `render_multi_size` — Apple's required App Store sizes (6.7", 6.5", 5.5") in one call.
- `render_play_store_set` — Play Store's 16:9 and 9:16 layouts.
- `make_showcase` — portfolio grid (4×N) for case studies.

Until rc.2 ships the set logic, you can produce a set by calling `render_screenshot` six times with different copy.

## 🟡🔒 `generate_screenshot`, `render_localized_set`

LLM-driven creative selection. `generate_screenshot` picks the template / colour / headline from your input image and renders. `render_localized_set` translates the copy across N languages with locale-aware fonts. Both need an LLM — they'll use [MCP sampling](docs/llm-strategy.md) when the connected client supports it (Claude Desktop / Claude Code / Cursor / Windsurf / Cline do), or fall back to `ANTHROPIC_API_KEY` for CI use.

## 🟡🔒 Vision tools — `pick_brand_color`, `extract_palette`, `suggest_headlines`, `detect_empty_state`, `clone_reference`

Land in v1.0.0-rc.3 via MCP sampling. All accept a screenshot path / data URL and return a structured analysis. Each has a deterministic fallback (e.g. colour quantisation for `pick_brand_color`) so they degrade gracefully without an LLM.

## 🟡 Video pipeline — `render_video`, `render_video_template`, `render_video_concept`, `auto_video`

Land in v1.1.0. Require `ffmpeg` + `ffprobe` (auto-discovered in standard locations; pin via `FFMPEG_PATH` / `FFPROBE_PATH` if your MCP client launches the server with a stripped PATH).

---

# MCP resources

The server also exposes 5 read-only resources via the standard MCP `resources/list` + `resources/read` flow. These are the "design context" Claude reads before calling tools.

| URI | What it returns |
|---|---|
| `myindai://presets` | Same content as `list_presets()`, exposed as a resource. |
| `myindai://schema` | JSON schema for `render_screenshot` inputs — for completion / validation. |
| `myindai://design-guide` | Long-form ASO design cookbook with positioning + copy patterns. |
| `myindai://assets` | Asset library catalogue. |
| `myindai://memory` | Current memory namespace contents. |

Read these from Claude with `resources/read { uri: "myindai://design-guide" }`.

---

# MCP prompts (named workflows)

The server registers a few named prompts via `prompts/list`. Most notable:

- **`aso-set-workflow`** — multi-phase consultant workflow that produces a full ASO set. Inputs: `app_name`, `count` (default 6), `language`.

Invoke via `prompts/get { name: "aso-set-workflow", arguments: { app_name: "MyApp", count: 6 } }`. The returned prompt body walks Claude through brand-kit discovery → headline draft → render → telemetry → iteration.

---

# Workflow recipes

## Single hero screenshot (rc.2 sweet spot)

1. `resources/read { uri: "myindai://design-guide" }` → context.
2. `tools/call { name: "list_presets" }` → pick a `background_preset` and `position_preset`.
3. `tools/call { name: "render_screenshot", arguments: { image, headline, background_preset, output_path } }` → done.
4. Show the user. Iterate on copy / colour. Re-call `render_screenshot`.

## Full ASO set (until rc.2 ships set tools)

Loop over your screenshot list, calling `render_screenshot` once per slot. Track choices in `memory_write` so re-runs are consistent.

## Brand-kit-first (recommended for second-time users)

1. `memory_read { namespace: "<app_id>" }` — fetch saved brand.
2. If empty: ask user for primary colour + voice, then `memory_write`.
3. Render against the stored brand.

---

# Environment variables (all optional)

| Var | Effect |
|---|---|
| `ANTHROPIC_API_KEY` | CI / non-interactive escape hatch. Calls Anthropic directly instead of asking the client via sampling. Not recommended for interactive MCP-client use. |
| `ANTHROPIC_MODEL` | Override the Anthropic model. Only honoured when `ANTHROPIC_API_KEY` is set. Default `claude-opus-4-7`. |
| `FFMPEG_PATH` | Absolute path to ffmpeg. Needed once video tools land in v1.1.0, and only if the MCP launcher strips PATH. |
| `FFPROBE_PATH` | Same, for ffprobe. |
| `MCP_DEBUG` | Log resolver decisions to stderr. |
| `MCP_MEMORY_DIR` | Override memory location. Default `~/.myindai-screenshot-mcp/memory/`. |
| `MCP_TELEMETRY_DIR` | Override telemetry location. Default `~/.myindai-screenshot-mcp/telemetry/`. |
| `MCP_IDLE_SHUTDOWN_MS` | How long Chromium stays warm after the last call. Default 60000 ms. |
| `MCP_MAX_IMAGE_BYTES` | Cap input image size. Default 10485760 (10 MB). |
| `MCP_PAGE_POOL` | Page-pool size; bigger = parallel renders at higher memory cost. Default 1. |
