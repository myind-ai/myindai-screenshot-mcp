---
name: myindai-screenshot
description: |
  Produce polished App Store / Play Store marketing screenshots, A/B variants, localized sets, and product videos via the `myindai-screenshot-mcp` server. Walks users through brand discovery → template choice → render → iterate. Handles 2D and (rc.3+) 3D device frames. Works in both MCP mode (Claude Desktop / Claude Code / Cursor / Windsurf / Cline) and CLI mode (`--doctor`, future `--render`).
  Triggers on: "App Store screenshot", "Play Store screenshot", "marketing screenshot", "ASO", "render screenshot", "screenshot template", "app store screenshots", "myindai-screenshot-mcp", "appshot", "render my app screenshot", "make a screenshot for the app store", "polish this raw screenshot", "headline for the app store", "2D vs 3D device frame", "screenshot variants", "brand colour for my app".
---

# myindai-screenshot — App Store / Play Store screenshot pipeline

This skill drives the [`myindai-screenshot-mcp`](https://github.com/myind-ai/myindai-screenshot-mcp) server end-to-end. Use it whenever a user wants to turn a raw phone-screen UI screenshot into a polished marketing asset.

## When to invoke this skill

A user says any of:

- "Make App Store screenshots for my app"
- "Render this raw screenshot with a marketing template"
- "Generate a 6-shot ASO set"
- "I need an A/B test of these screenshots"
- "Pick a brand colour from my app screenshot"
- "Localise these screenshots to ja, fr, es"
- "Render a product video from these screenshots"

If the user has the MCP server installed, the `render_screenshot` tool is callable directly. If they don't, **Phase 0** below handles install.

## Phase 0 — Verify the MCP server is connected

Before anything else, check if the tools are available. Try `tools/list` (or call a no-arg tool like `list_presets`). If it returns the `myindai-screenshot-mcp` tool set, skip to Phase 1.

If not connected, give the user the install snippet:

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

Where to paste it:

| Client | Config path |
|---|---|
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows) |
| Claude Code | `claude mcp add myindai-screenshot -- npx -y myindai-screenshot-mcp` |
| Cursor | `~/.cursor/mcp.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| Cline | extension settings |

After they paste, ask them to **restart the client** and confirm the 25 tools appear (`render_screenshot`, `list_presets`, etc.).

If anything looks off, ask them to run `npx -y myindai-screenshot-mcp --doctor` and paste the output — that diagnoses 90% of install issues.

## Phase 1 — Discovery (5 questions, max)

Ask the user (one at a time when uncertain, batch when obvious):

1. **App name + 1-line description.** Anchors the copy.
2. **Raw screenshot paths.** Either absolute file paths, or have them paste images. For a single hero shot, one is enough.
3. **Brand colour** (optional). Hex code. If they don't have one, suggest `pick_brand_color` in rc.3 — for rc.2, pick a `background_preset` that matches the screenshot's dominant colour.
4. **Tone.** "Premium / playful / minimal / loud" — guides headline + template.
5. **Target store.** App Store iPhone 6.7" is the default. Play Store has different aspect ratios; cover in v1.0.0-rc.2.

Read `myindai://design-guide` for context-aware patterns. Read `memory_read { namespace: <app_slug> }` to retrieve any saved brand kit from prior sessions.

## Phase 2 — Render the first screenshot

1. Call `tools/call { name: "list_presets" }` once at session start to know what's available.
2. Pick:
   - `position_preset` — `centered` works for most cases; `tilt-left` / `tilt-right` adds energy; `bleed-bottom` puts headline at top.
   - `background_preset` — match the screenshot's colour vibe. Available in rc.2: `ocean`, `sunset`, `forest`, `violet`, `peach`. For custom colours, pass `background.solid` or `background.gradient.stops` instead.
   - `text_color` — `light` on dark gradient, `dark` on light gradient.
3. Draft a headline (2–7 words, benefit-driven) + optional subheadline.
4. Call:

```jsonc
{
  "tool": "render_screenshot",
  "input": {
    "image": "<absolute_path>",
    "headline": "Track every habit",
    "subheadline": "Build streaks. Stay accountable.",
    "background_preset": "ocean",
    "text_color": "light",
    "position_preset": "centered",
    "output_path": "<absolute_output_path>"
  }
}
```

5. The tool returns either `image_base64` or `path`. Show the user.

## Phase 3 — Iterate

Ask:

- Does the headline land?
- Is the colour right?
- Is the device positioned well?

For each piece of feedback, change ONE parameter at a time and re-render. Don't change three things at once — the user can't isolate which change matters.

Record decisions:

```jsonc
{
  "tool": "memory_write",
  "input": {
    "namespace": "<app_slug>",
    "value": {
      "brand": { "primary": "<hex>", "voice": "..." },
      "last_template": "clean-minimal",
      "last_background": "ocean",
      "last_position": "centered"
    }
  }
}
```

Next session, `memory_read` brings these back so iteration is faster.

## Phase 4 — Set, variants, sizes

When the hero is locked in:

- **Full ASO set (6 screenshots):** loop `render_screenshot` six times with different copy. (`render_aso_set` lands in rc.2 — until then, manual loop.)
- **A/B variants:** call `render_screenshot` 2–4 times with the same input but different `background_preset` or `position_preset`.
- **Multi-size:** call once per device key in `outputDevices`. (`render_multi_size` lands in rc.2.)
- **Localisation:** call `render_localized_set` with `languages: ["en", "ja", "fr", ...]`. (Lands in rc.2 with sampling-driven translation.)
- **Telemetry hook:** `record_telemetry { app_id, template, headline, ... }` so the user can correlate which variants converted later.

## 2D vs 3D device frames

- **2D (default in rc.2)** — fast, flat. Runtime-generated rounded-rectangle device shell. Sub-second render. Use for everything in rc.2.
- **3D (rc.3+)** — real `.glb` device frames (iPhone 15 Pro Max, Samsung Galaxy S25 Ultra) with perspective + lighting. Activate via:
  ```jsonc
  { "mode": "3d", "screenshot": { "use3D": true, "device3D": "iphone", "rotation3D": { "y": 8 } } }
  ```
  Returns a `placeholder geometry used` debug note in rc.2 — guide the user to upgrade once rc.3 ships.

## CLI mode

Some users will want to script this outside an MCP client (CI, batch scripts). For those:

```bash
# Health check
npx -y myindai-screenshot-mcp --doctor

# Version
npx -y myindai-screenshot-mcp --version

# Help (lists all env vars)
npx -y myindai-screenshot-mcp --help
```

A standalone `render-screenshot` CLI subcommand lands in v1.0.0-rc.3. Until then, scripted rendering goes through the stdio MCP transport. Example Node script:

```js
import { spawn } from "node:child_process";
const srv = spawn("npx", ["-y", "myindai-screenshot-mcp"], { stdio: ["pipe", "pipe", "inherit"] });
const send = (m) => srv.stdin.write(JSON.stringify(m) + "\n");
send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "cli", version: "1.0" } } });
send({ jsonrpc: "2.0", method: "notifications/initialized" });
send({ jsonrpc: "2.0", id: 2, method: "tools/call",
  params: { name: "render_screenshot", arguments: { image: "/path/in.png", headline: "Hi", background_preset: "ocean", output_path: "/path/out.png" } } });
// Listen on srv.stdout for responses.
```

## Gotchas

| Symptom | Cause | Fix |
|---|---|---|
| `tools/call` returns `unknown template: …` | Renderer doesn't ship that template in rc.2 | Use `clean-minimal` (the only working template in rc.2). Other templates land in rc.2.x. |
| Render returns a "coming in v1.0.0-rc.2" error | You called a 🟡-status tool. | Use `render_screenshot` directly for a single shot; loop it manually for sets until rc.2 ships the set tools. |
| `pick_brand_color` says "llm_unavailable" | Client doesn't support sampling AND `ANTHROPIC_API_KEY` isn't set. | Either upgrade client (Claude Desktop / Code / Cursor / Windsurf / Cline all support sampling), or set `ANTHROPIC_API_KEY` in the MCP server env. |
| `--doctor` shows ffmpeg ❌ | Stripped PATH in the MCP launcher. Not blocking in rc.2 (video tools deferred to v1.1.0). | Ignore until v1.1.0. When video lands, set `FFMPEG_PATH=/opt/homebrew/bin/ffmpeg`. |
| `render_screenshot` returns a render but the screenshot looks tiny | `position_preset` of `bleed-bottom` / `bleed-top` shrinks the device to make room for text. | Switch to `centered` or pass explicit `screenshot.scale: 110`. |
| Headlines come out boring | rc.2 has no vision LLM yet; you're writing the copy yourself. | Coming in rc.3: `suggest_headlines` reads the screenshot via sampling and proposes 5–10 options. |
| Output PNG is huge (1290×2796, ~600 KB) | Correct — that's the Apple-required size. | The user can compress later for upload, but App Store Connect accepts the raw output. |

## Quick install of this skill

```bash
# clone the repo
git clone https://github.com/myind-ai/myindai-screenshot-mcp.git /tmp/m

# copy the skill into Claude Code
mkdir -p ~/.claude/skills
cp -r /tmp/m/skills/myindai-screenshot ~/.claude/skills/

# (optional) clean up
rm -rf /tmp/m
```

Then add the MCP server itself (separately):

```bash
# Claude Code
claude mcp add myindai-screenshot -- npx -y myindai-screenshot-mcp

# Or hand-edit your client's mcp_config.json with the snippet from Phase 0.
```

Restart your client. Type one of the trigger phrases and this skill will activate.

## Status snapshot (v1.0.0-rc.2)

- ✅ `render_screenshot` end-to-end with one template (`clean-minimal`) on 3 device sizes.
- ✅ Catalogue / memory / telemetry / asset tools.
- ✅ CLI doctor / version / help.
- 🟡 5 set-level renderers register but defer to rc.2.x.
- 🟡 5 vision tools land in rc.3 via sampling.
- 🟡 4 video tools land in v1.1.0.

Full status table in [`TOOLS.md`](../../TOOLS.md). Rendering provenance in [`docs/clean-room-rewrite.md`](../../docs/clean-room-rewrite.md). LLM strategy in [`docs/llm-strategy.md`](../../docs/llm-strategy.md).
