# myindai-screenshot-mcp

> MCP server that turns raw app screenshots into polished App Store / Play Store marketing screenshots, A/B variants, localized sets, and product videos. Designed for indie devs and small ASO teams who want a real ASO pipeline driven from their MCP client (Claude Desktop / Claude Code / Cursor / Windsurf / Cline).

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/Model%20Context%20Protocol-1.x-7c3aed.svg)](https://modelcontextprotocol.io)
[![status](https://img.shields.io/badge/status-v1.0.0--rc.7-brightgreen.svg)](#status)
[![npm](https://img.shields.io/npm/v/myindai-screenshot-mcp.svg)](https://www.npmjs.com/package/myindai-screenshot-mcp)

Maintained by [myind.ai](https://github.com/myind-ai).

---

## Status

**v1.0.0-rc.7.** 25 tool surfaces; the renderer produces real App Store screenshots today on a hand-drawn iPhone device frame (rounded chassis + chrome rim + opt-in dynamic island, pure Canvas 2D — no `.glb`, no external assets).

**Working now:**

- ✅ `render_screenshot` — full creative control: `background_preset` + rich `background` objects (gradient/solid), `position_preset` (centre / tilt / bleed), `screenshot` overrides (`scale`, `x`, `y`, `rotation`, `cornerRadius`, `glow`, `shadow`), `text` overrides (`headlineSize`, `headlineColor`, `headlineWeight`, `headlineFont`, `headlineHighlightWord` + pill, `letterSpacing`, `italic`, `underline`, `offsetY`, …), `text_color`, and the 4 App Store iPhone sizes (6.9″ / 6.7″ / 6.5″ / 5.5″).
- ✅ `list_presets`, `list_assets`, `list_video_templates`, `record_telemetry`, `list_telemetry`, `memory_read`, `memory_write`
- ✅ `--doctor`, `--install-skill`, `--version`, `--help`

**Deferred (with explicit warnings when invoked):**

- 🟡 Real WebGL 3D (`use3D`, `device3D`, `rotation3D`) — needs licensed `.glb` device models. `mode: "3d"` currently returns a 2D fallback + a `warnings` entry.
- 🟡 Set-level tools (`render_aso_set`, `render_ab_variants`, `render_multi_size`, `render_localized_set`, `render_play_store_set`, `make_showcase`) — loop `render_screenshot` until they land.
- 🟡 Vision tools (`suggest_headlines`, `pick_brand_color`, `extract_palette`, `clone_reference`, `detect_empty_state`) and `generate_screenshot` — use [MCP sampling](docs/llm-strategy.md); emit a `warnings` entry when no LLM is available.
- 🟡 Video pipeline (`render_video`, `auto_video`, `render_video_template`, `render_video_concept`) — v1.1.0.

See [CHANGELOG.md](CHANGELOG.md) for the full history and [TOOLS.md](TOOLS.md) for the per-tool status table.

## Install (end user)

Two commands — add the MCP server, then (optionally) install the Claude Code skills:

```bash
# 1. add the server to your MCP client
claude mcp add myindai-screenshot -- npx -y myindai-screenshot-mcp

# 2. install the bundled Claude Code skills (getting-started + design templates)
npx -y myindai-screenshot-mcp --install-skill
```

Or hand-edit your client's config. **No API key needed** — the working tool surface is renderer-only, and the (later) vision tools use [MCP sampling](docs/llm-strategy.md) so they ask **your** MCP client's LLM, never the server's own key:

```json
{
  "mcpServers": {
    "myindai-screenshot": {
      "command": "npx",
      "args": ["-y", "myindai-screenshot-mcp"]
    }
  }
}
```

Restart your MCP client. The server self-installs Chromium for the headless renderer the first time it's needed.

If you really want to bypass MCP sampling and have the server call Anthropic directly (e.g. you're running in a CI context with no MCP client at the other end), you can opt in with `ANTHROPIC_API_KEY`:

```json
{
  "mcpServers": {
    "myindai-screenshot": {
      "command": "npx",
      "args": ["-y", "myindai-screenshot-mcp"],
      "env": { "ANTHROPIC_API_KEY": "sk-ant-..." }
    }
  }
}
```

This is optional and not the recommended path — see [docs/llm-strategy.md](docs/llm-strategy.md) for the rationale.

For video tools (`render_video`, `auto_video`, etc., shipping in v1.1.0) you'll also need `ffmpeg` + `ffprobe`:

```bash
brew install ffmpeg                    # macOS
sudo apt install ffmpeg                # Debian/Ubuntu
sudo dnf install ffmpeg                # Fedora
```

The server **auto-discovers** ffmpeg in the standard install locations even when your MCP client launches it with a stripped `PATH` (`/usr/bin:/bin`) — no manual config needed for Homebrew, apt, MacPorts, Linuxbrew, Snap, or Flatpak installs.

## Verify the install — `--doctor`

```bash
npx -y myindai-screenshot-mcp --doctor
```

Example output:

```
myindai-screenshot-mcp version : 1.0.0-rc.7
node                            : v22.14.0
platform                        : darwin (arm64)
PATH                            : /usr/bin:/bin
ANTHROPIC_API_KEY               : unset (not required — uses your MCP client's LLM via sampling)
FFMPEG_PATH                     : unset (not required — video tools land in v1.1.0)
FFPROBE_PATH                    : unset (not required — video tools land in v1.1.0)
```

Any ❌ tells you exactly what to fix. `unset` for the optional fields is fine.

## Tools

| Tool | Status | Description |
|---|---|---|
| `render_screenshot` | ✅ | Single App Store / Play Store screenshot. Full background / position / screenshot / text overrides + 4 App Store iPhone sizes. |
| `list_presets` | ✅ | Catalogue of templates, gradients, modes, devices, canvas sizes |
| `list_assets` / `get_asset` | ✅ | Local asset library |
| `list_video_templates` | ✅ | Video template catalogue |
| `record_telemetry` / `list_telemetry` | ✅ | Per-render telemetry log |
| `memory_read` / `memory_write` | ✅ | Per-app design memory (brand kit, voice, last template) |
| `--doctor` / `--install-skill` / `--version` / `--help` | ✅ | CLI surfaces |
| `generate_screenshot` | 🟡 | LLM-driven copy + render. Uses sampling; warns + falls back deterministically without an LLM. |
| `render_aso_set` / `render_ab_variants` / `render_multi_size` / `render_localized_set` / `render_play_store_set` / `make_showcase` | 🟡 | Set-level renderers. Loop `render_screenshot` until they land. |
| `pick_brand_color` / `extract_palette` / `suggest_headlines` / `detect_empty_state` / `clone_reference` | 🟡 | Vision tools — via MCP sampling. |
| `render_video` / `render_video_template` / `render_video_concept` / `auto_video` | 🟡 v1.1.0 | Video pipeline (needs ffmpeg). |

Full per-tool input schemas + examples: [TOOLS.md](TOOLS.md).

## Roadmap

After v1.0.0 ships (full feature parity with the v0.5.1 surface), the next four sprints add capabilities no competing MCP currently offers. Each one will have its own design doc and PR series before implementation begins.

- **Sprint 2 — Brand kit / Figma import.** `import_brand_kit`, `import_figma_tokens`. Set fonts / colours / spacing once, every render auto-respects them.
- **Sprint 3 — Conversion-optimised A/B intelligence.** `score_screenshot_ctr` (vision-model CTR prediction), `lint_aso` (best-practice linting), `compare_competitor` (scrape + delta).
- **Sprint 4 — AI 3D scenes and motion graphics.** Major creative work on the three.js + ffmpeg pipeline: 3D device shots with depth, parallax, animated reveals.
- **Sprint 5 — Direct ASC / Play upload tools.** `asc_upload_shots`, `play_upload_shots`. Push finished assets straight to App Store Connect and Google Play.

## Architecture (one-pager)

```
┌─ MCP client (Claude Desktop / Code / Cursor / Windsurf) ───────────────┐
│                                                                        │
│                          (stdio / JSON-RPC)                            │
│                                ▼                                       │
│  ┌─ myindai-screenshot-mcp (Node + TypeScript) ──────────────────────┐ │
│  │  src/server.ts        ← 25 tool definitions                       │ │
│  │  src/tools/*.ts       ← per-tool logic                            │ │
│  │  src/renderer/*.ts    ← Playwright driver                         │ │
│  │  src/video/*.ts       ← ffmpeg pipeline                           │ │
│  │  src/ai/*.ts          ← Anthropic Vision wrappers                 │ │
│  └────────────────────────┬─────────────────────────────────────────┘  │
│                           │ Playwright CDP                              │
│                           ▼                                             │
│  ┌─ headless Chromium ────────────────────────────────────────────────┐ │
│  │  mcp/frontend/index.html        ← canvas + DOM scaffold            │ │
│  │  mcp/frontend/app.js            ← window.__mcp (4 functions)       │ │
│  │  mcp/frontend/three-renderer.js ← hand-drawn iPhone device frame   │ │
│  │  mcp/frontend/language-utils.js ← locale / font selection          │ │
│  │  mcp/frontend/styles.css                                          │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

The server-renderer contract is **4 functions on `window.__mcp`** — see [docs/architecture.md](docs/architecture.md) for details. That contract is what makes the clean-room rewrite feasible.

## Tools reference + Claude Code skills

- **[TOOLS.md](TOOLS.md)** — every tool (25 surfaces), inputs/outputs, status, example calls, env vars, and resource URIs (`myindai://presets`, `myindai://design-guide`, …).
- **Two bundled Claude Code skills**, installed with one command:

  ```bash
  npx -y myindai-screenshot-mcp --install-skill
  ```

  | Skill | What it does |
  |---|---|
  | [`myindai-screenshot`](skills/myindai-screenshot/SKILL.md) | Getting-started: install check, brand discovery, render, iterate, CLI fallback. |
  | [`myindai-screenshot-templates`](skills/myindai-screenshot-templates/SKILL.md) | Battle-tested design recipes — 10 named archetypes (5 2D + 5 3D), canvas math, panoramic split, source-frame rules, renderer-support matrix. |

  After install, say *"make App Store screenshots for my app"* and the right skill activates. See [skills/README.md](skills/README.md) for Cursor / Windsurf / Cline install paths (also supports `curl … | sh` and manual clone).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Important: contributors to the renderer must read [docs/clean-room-rewrite.md](docs/clean-room-rewrite.md) first.

## Provenance

The renderer in `mcp/frontend/` is an original implementation written from scratch under a documented clean-room protocol — see [docs/clean-room-rewrite.md](docs/clean-room-rewrite.md) for the behavioural spec it was built against and [ASSETS.md](ASSETS.md) for the provenance log of every shipped binary asset.

## License

[MIT](LICENSE) © 2026 Shantanu Bombatkar / myind.ai
