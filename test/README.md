# test/ — verify the published package on any machine

This folder is meant for downstream users. It contains a self-contained end-to-end test that proves the **npm-published** `myindai-screenshot-mcp` works on a fresh machine — no local source needed.

## Run the test on another PC

Prerequisites: Node 18+, `npx` (ships with Node).

```bash
# 1. fetch a sample input image (or use your own .png)
curl -fsSL https://github.com/myind-ai/myindai-screenshot-mcp/raw/main/assets/_provenance/sample-input.png \
  -o /tmp/input.png

# 2. fetch and run the e2e
curl -fsSL https://raw.githubusercontent.com/myind-ai/myindai-screenshot-mcp/main/test/published-e2e.mjs \
  -o /tmp/e2e.mjs

node /tmp/e2e.mjs /tmp/input.png /tmp/output.png

# 3. open the rendered screenshot
open /tmp/output.png      # macOS
xdg-open /tmp/output.png  # Linux
start /tmp/output.png     # Windows
```

## What the test does

1. Spawns `npx -y myindai-screenshot-mcp@latest` — pulls the published package from `registry.npmjs.org`. **Local source code is not touched.**
2. Sends an MCP `initialize` handshake declaring `sampling` capability.
3. Calls `tools/list` and counts tools (should be 25, including `render_screenshot`).
4. Calls `tools/call render_screenshot` with your input image, a headline, and `background_preset: "sunset"`.
5. Verifies the response, then opens the PNG, checks magic bytes + dimensions (`1290 × 2796`).
6. Prints **`✅ END-TO-END SUCCESS`** if everything passes.

## Expected output

```
[…] [e2e] spawning: npx -y myindai-screenshot-mcp@latest (this fetches from npmjs.org)
[…] [e2e] step 1: initialize (up to 5 min for cold-start npx download + chromium boot)
[…] [e2e] server ready (stderr): ~120s after spawn  (first run only — subsequent runs are ~5s)
[…] [e2e] init done: server={"name":"myindai-screenshot-mcp","version":"1.0.0-rc.3"} caps=[tools,resources,prompts]
[…] [e2e] step 2: tools/list
[…] [e2e] tools registered: 25  (render_screenshot present: true)
[…] [e2e] step 3: tools/call render_screenshot (rendering a real PNG…)
[…] [e2e] render returned in ~4000ms; 1 content block(s) types=[text]
[…] [e2e] file: /tmp/output.png
[…] [e2e]   size       = ~400000-600000 bytes
[…] [e2e]   PNG magic  = ✅
[…] [e2e]   dimensions = 1290 × 2796
[…] [e2e] ✅ END-TO-END SUCCESS — the published npm package renders correctly on a fresh install.
```

## Cold-start timing notes

- **First ever run on a machine:** ~2 min. Reason: `npx` fetches the package (~150 KB) plus runtime deps (~80 MB: playwright, sharp, anthropic, mcp-sdk), then Playwright downloads Chromium (~150 MB) the first time `render_screenshot` is called.
- **Subsequent runs:** ~5 s (cached package, Chromium already on disk).
- The wall-time budget of 5 min for `initialize` is intentional headroom for slow networks and the Chromium download.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `timeout waiting for id 1` | `npx` is still downloading or Playwright is installing Chromium. | Re-run; on second attempt the cache is warm. If it keeps timing out, run `npx -y myindai-screenshot-mcp --doctor` directly and read the output. |
| `ECONNREFUSED registry.npmjs.org` | Offline or proxy. | Check `npm config get registry`; verify network. |
| `EACCES` writing output | Output dir not writable by your user. | Pick a writable path, e.g. `~/Desktop/output.png`. |
| Server reports wrong version | npm cache pinned to an older version. | `npx -y myindai-screenshot-mcp@latest --version` should print the current rc. Force-clean with `npx --no-install --silent --force …` or `npm cache clean --force`. |

## Add this to your CI

Drop the script into `.github/workflows/published-e2e.yml`:

```yaml
name: published e2e
on: { workflow_dispatch: {}, schedule: [{ cron: "0 12 * * *" }] }
jobs:
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - uses: actions/checkout@v4
      - run: npx -y playwright@1.59 install --with-deps chromium
      - run: node test/published-e2e.mjs assets/_provenance/sample-input.png /tmp/out.png
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: rendered, path: /tmp/out.png }
```

This runs daily and uploads the rendered PNG as an artifact — you can eyeball it after each scheduled run to catch regressions in the published package.
