# myindai-screenshot-mcp

> MCP server that turns raw app screenshots into polished App Store / Play Store marketing screenshots, A/B variants, localized sets, and product videos. Designed for indie devs and small ASO teams who want a real ASO pipeline driven from their MCP client (Claude Desktop / Claude Code / Cursor / Windsurf / Cline).

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/Model%20Context%20Protocol-1.x-7c3aed.svg)](https://modelcontextprotocol.io)
[![status](https://img.shields.io/badge/status-v1.0.0--rc.1%20clean--room%20preview-orange.svg)](#status)

Maintained by [myind.ai](https://github.com/myind-ai).

---

## Status

**v1.0.0-rc.1 — clean-room preview release.** The MCP server (all 25 tool surfaces) is the production codebase. The headless renderer (`mcp/frontend/`) is being re-implemented from scratch under the [clean-room rewrite protocol](docs/clean-room-rewrite.md). v1.0.0-rc.1 ships:

- ✅ `--doctor` — environment / dependency check
- ✅ `list_presets`, `list_assets`, `list_video_templates`, `list_presets` — catalog tools
- ✅ `render_screenshot` — single screenshot, `clean-minimal` template, iPhone 15 Pro Max device
- 🟡 `render_aso_set`, `render_ab_variants`, `render_multi_size`, `render_localized_set`, `render_play_store_set` — coming in v1.0.0-rc.2
- 🟡 `render_video`, `auto_video`, `render_video_template`, `render_video_concept` — coming in v1.1.0
- 🟡 `suggest_headlines`, `pick_brand_color`, `extract_palette`, `clone_reference`, `detect_empty_state` — vision tools coming in v1.0.0-rc.3

See [CHANGELOG.md](CHANGELOG.md) for the full ship plan.

## Install (end user)

The fastest path — let your MCP client install it via `npx`:

```json
{
  "mcpServers": {
    "myindai-screenshot": {
      "command": "npx",
      "args": ["-y", "myindai-screenshot-mcp"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

Restart your MCP client. The server self-installs Chromium for the headless renderer the first time it's needed.

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
myindai-screenshot-mcp version : 1.0.0-rc.1
node                            : v22.14.0
platform                        : darwin (arm64)
PATH                            : /usr/bin:/bin
ANTHROPIC_API_KEY               : ✅ set (vision tools enabled)
FFMPEG_PATH                     : <unset — will probe>
FFPROBE_PATH                    : <unset — will probe>

---- ffmpeg / ffprobe resolution ----
ffmpeg                          : ✅ /opt/homebrew/bin/ffmpeg
ffprobe                         : ✅ /opt/homebrew/bin/ffprobe
```

Any ❌ tells you exactly what to fix.

## Tools (v1.0.0-rc.1 → v1.1.0 roadmap)

| Tool | Status | Description |
|---|---|---|
| `--doctor` | ✅ | Environment + dependency report |
| `list_presets` | ✅ | Catalogue of templates, gradients, modes, devices, canvas sizes |
| `list_assets` | ✅ | Local asset library (uploaded screenshots, reference imports) |
| `list_video_templates` | ✅ | Video template catalogue |
| `render_screenshot` | ✅ (1 template, 1 device) | Render a single App Store screenshot |
| `pick_brand_color` | 🟡 v1.0.0-rc.3 | Auto-pick a brand colour from the input screenshot |
| `extract_palette` | 🟡 v1.0.0-rc.3 | Extract a multi-stop palette for use as gradients |
| `suggest_headlines` | 🟡 v1.0.0-rc.3 | Vision-driven headline suggestions for the input screenshot |
| `detect_empty_state` | 🟡 v1.0.0-rc.3 | Detect "empty state" screenshots so they're handled with different copy |
| `clone_reference` | 🟡 v1.0.0-rc.3 | Clone the style of a reference screenshot from a competitor |
| `render_ab_variants` | 🟡 v1.0.0-rc.2 | Render N variants for A/B testing |
| `render_aso_set` | 🟡 v1.0.0-rc.2 | Render a full 6-shot ASO set |
| `render_multi_size` | 🟡 v1.0.0-rc.2 | Export every required App Store size in one shot |
| `render_localized_set` | 🟡 v1.0.0-rc.2 | One command → N languages, locale-aware fonts |
| `render_play_store_set` | 🟡 v1.0.0-rc.2 | Play Store-specific aspect ratios and constraints |
| `make_showcase` | 🟡 v1.0.0-rc.2 | Showcase grid for portfolio / case studies |
| `render_video` | 🟡 v1.1.0 | Render a product video from screenshots + script |
| `render_video_template` | 🟡 v1.1.0 | Apply a video template (intro/loop/outro) |
| `render_video_concept` | 🟡 v1.1.0 | LLM-driven video concept → video |
| `auto_video` | 🟡 v1.1.0 | One-shot: screenshots → finished video |
| `generate_screenshot` | 🟡 v1.0.0-rc.2 | LLM-driven copy + render |
| `record_telemetry` | ✅ | Record rendering telemetry for later analysis |
| `list_telemetry` | ✅ | Inspect recorded telemetry |
| `memory_read`, `memory_write` | ✅ | Per-app design memory (brand kit, voice, last-used template) |

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
│  │  mcp/frontend/index.html   ← canvas + DOM scaffold                 │ │
│  │  mcp/frontend/app.js       ← window.__mcp (4 functions)            │ │
│  │  mcp/frontend/three-renderer.js  ← three.js scene                  │ │
│  │  mcp/frontend/img/*.svg    ← UI icons                              │ │
│  │  mcp/frontend/models/*.glb ← 3D device models                      │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

The server-renderer contract is **4 functions on `window.__mcp`** — see [docs/architecture.md](docs/architecture.md) for details. That contract is what makes the clean-room rewrite feasible.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Important: contributors to the renderer must read [docs/clean-room-rewrite.md](docs/clean-room-rewrite.md) first.

## Why a clean-room rewrite?

Earlier development experiments referenced [github.com/YUZU-Hub/appscreen](https://github.com/YUZU-Hub/appscreen) (no licence). To launch this as a real MIT-licensed open-source project, the entire renderer is being re-implemented from scratch against a behavioural spec read only from the public MCP server source. The legacy snapshot lives in a private backup repo for diff / audit purposes. Full asset provenance is logged in [ASSETS.md](ASSETS.md).

## License

[MIT](LICENSE) © 2026 Shantanu Bombatkar / myind.ai
