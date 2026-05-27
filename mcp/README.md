# myindai-screenshot-mcp

MCP server that turns raw app screenshots into polished App Store / Play Store marketing screenshots and product videos. 25 tools spanning the full ASO pipeline: vision-driven headline suggestions, brand-colour picking, set-level rendering, A/B variants, multi-size export, localization, telemetry, asset library, plus a full video pipeline.

Maintained by [myind.ai](https://github.com/myind-ai). See the [project README](https://github.com/myind-ai/myindai-screenshot-mcp#readme) for full docs.

> **Status — v1.0.0-rc.7.** `render_screenshot` works end-to-end with full creative control — `background_preset` + rich `background` objects, `position_preset` (centre / tilt / bleed), `screenshot` overrides (`scale`, `x`, `y`, `rotation`, `glow`, `shadow`), `text` overrides (`headlineSize`, `headlineColor`, `headlineWeight`, highlight, …), `text_color`, and the 4 App Store iPhone sizes (6.9″ / 6.7″ / 6.5″ / 5.5″) — rendered on a hand-drawn iPhone device frame (pure Canvas 2D, no external assets). Set-level, vision, and video tools are registered but deferred (they return a clear `warnings` entry); see the [project README](https://github.com/myind-ai/myindai-screenshot-mcp#status) for the per-tool status table.

## Install

Two commands:

```bash
# add the server
claude mcp add myindai-screenshot -- npx -y myindai-screenshot-mcp

# install the bundled Claude Code skills (getting-started + design templates)
npx -y myindai-screenshot-mcp --install-skill
```

Or hand-edit your client's config. **No API key needed** — the working tool surface is renderer-only, and vision tools use [MCP sampling](https://github.com/myind-ai/myindai-screenshot-mcp/blob/main/docs/llm-strategy.md) (your client's LLM), so the server never needs its own key:

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

Restart your MCP client (Claude Desktop / Code / Cursor / Windsurf / Cline). The server self-installs Chromium for the headless renderer the first time it's needed.

For non-interactive (CI) use where there's no MCP client to do sampling, you can opt into a direct Anthropic key with `"env": { "ANTHROPIC_API_KEY": "sk-ant-..." }` — not the recommended path.

For video tools (shipping in v1.1.0) you'll also need `ffmpeg` + `ffprobe`:

```bash
brew install ffmpeg                    # macOS
sudo apt install ffmpeg                # Debian/Ubuntu
sudo dnf install ffmpeg                # Fedora
```

The server **auto-discovers** ffmpeg in the standard install locations even when your MCP client launches it with a stripped `PATH` (`/usr/bin:/bin`) — no manual config needed for Homebrew, apt, MacPorts, Linuxbrew, Snap, or Flatpak installs.

## Verify — `--doctor`

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

Any ❌ tells you exactly what to fix.

## Troubleshooting

### `Error: spawn ffmpeg ENOENT` / `ffmpeg not found in PATH`

Claude Desktop / Cursor / Windsurf launch MCP servers with a minimal inherited PATH that often doesn't include `/opt/homebrew/bin`. The server auto-probes standard locations, but you can pin it:

```json
{
  "mcpServers": {
    "myindai-screenshot": {
      "command": "npx",
      "args": ["-y", "myindai-screenshot-mcp"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "FFMPEG_PATH": "/opt/homebrew/bin/ffmpeg",
        "FFPROBE_PATH": "/opt/homebrew/bin/ffprobe"
      }
    }
  }
}
```

### Renderer doesn't start

The renderer is a static HTML page in `mcp/frontend/` that Chromium loads via `file://`. If it never reaches `window.__mcp.ready`, set `MCP_DEBUG=1` to see page console logs in the server's stderr.

## License

[MIT](LICENSE) © 2026 Shantanu Bombatkar / myind.ai
