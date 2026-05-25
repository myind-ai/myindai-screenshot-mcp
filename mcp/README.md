# myindai-screenshot-mcp

MCP server that turns raw app screenshots into polished App Store / Play Store marketing screenshots and product videos. 25 tools spanning the full ASO pipeline: vision-driven headline suggestions, brand-colour picking, set-level rendering, A/B variants, multi-size export, localization, telemetry, asset library, plus a full video pipeline.

Maintained by [myind.ai](https://github.com/myind-ai). See the [project README](https://github.com/myind-ai/myindai-screenshot-mcp#readme) for full docs.

> **Status — v1.0.0-rc.1 (clean-room preview).** The server is the full v0.5.1 surface re-published under a new package name and MIT license. The headless renderer in `frontend/` is being re-implemented from scratch (see the project [clean-room-rewrite doc](https://github.com/myind-ai/myindai-screenshot-mcp/blob/main/docs/clean-room-rewrite.md)). v1.0.0-rc.1 ships `render_screenshot` (1 template, 1 device) + `--doctor` + catalog tools. Other tools land in v1.0.0-rc.2 → v1.0.0.

## Install

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

Restart your MCP client (Claude Desktop / Code / Cursor / Windsurf / Cline). The server self-installs Chromium for the headless renderer the first time it's needed.

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

## Migrating from `appscreen-mcp`

`appscreen-mcp` was the development name. v1.0.0 is the rebranded clean-room release. To migrate:

```json
{
  "mcpServers": {
    "myindai-screenshot": {       // ← new name, or keep "appscreen" if you prefer
      "command": "npx",
      "args": ["-y", "myindai-screenshot-mcp"]    // ← only this line changes
    }
  }
}
```

All tool names, schemas, and behavior are preserved. No app-side changes needed.

## License

[MIT](LICENSE) © 2026 Shantanu Bombatkar / myind.ai
