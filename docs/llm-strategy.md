# LLM strategy — sampling-first, key-optional

## TL;DR

`myindai-screenshot-mcp` does not require its own `ANTHROPIC_API_KEY`. When a tool needs an LLM (vision, headline writing, brand-colour inference, empty-state detection, localisation) it asks **your MCP client's LLM** via [MCP sampling](https://modelcontextprotocol.io/specification/2025-06-18/client/sampling) — the same key you use to talk to Claude Desktop / Claude Code / Cursor / Windsurf / Cline. One key, one bill, one consent prompt.

```
┌─ your MCP client ──────────────────────────────────────────────────┐
│  You already pay for the LLM here (Claude / GPT / Gemini / …).     │
│  Has your API key. Has your consent.                               │
└──┬──────────────────────┬──────────────────────────────────────────┘
   │ tool call            │ sampling/createMessage  (with user confirm)
   ▼                      ▲
┌─ myindai-screenshot-mcp ──────────────────────────────────────────┐
│  Doesn't have your API key. Doesn't want it.                       │
│  Just renders pixels and asks the client to do the thinking.       │
└────────────────────────────────────────────────────────────────────┘
```

## Why this matters

Most MCP servers in the ASO / screenshot / marketing space require their own API key:

- You configure your client (Claude Desktop) with one key.
- You configure the MCP server with another key.
- You pay twice. You audit two billing dashboards. You rotate two secrets.
- The server can quietly burn tokens with no client-side visibility.

MCP sampling fixes this. The server says "I'd like the client to ask its LLM this prompt, please" and the client decides (with a user prompt) whether to comply. The server never sees an API key.

## Status by release

| Tool | Needs LLM? | Implementation |
|---|---|---|
| `render_screenshot`, `list_*`, `--doctor`, `memory_*`, `record_telemetry`, `list_telemetry` | No | Renderer-only. No LLM call. |
| `pick_brand_color`, `extract_palette` | Yes | v1.0.0-rc.3 — sampling. |
| `suggest_headlines`, `detect_empty_state`, `clone_reference` | Yes | v1.0.0-rc.3 — sampling. |
| `render_localized_set` | Yes (translations) | v1.0.0-rc.2 — sampling. |
| `render_video_concept`, `auto_video` | Yes (script writing) | v1.1.0 — sampling. |
| `generate_screenshot` (LLM-driven copy + render) | Yes | v1.0.0-rc.2 — sampling. |

## The escape hatch: direct API key

For people running this in **non-interactive** contexts — CI scripts, batch pipelines, headless agents — there's no human at the other end to approve sampling requests. For those use cases, `ANTHROPIC_API_KEY` (or future `OPENAI_API_KEY`, `GEMINI_API_KEY`) is an opt-in escape hatch:

```json
{
  "env": { "ANTHROPIC_API_KEY": "sk-ant-..." }
}
```

When the env var is set, the AI tools call the provider directly instead of asking the client. This path is preserved for backwards compatibility with the v0.5.1 design and for CI use. We don't recommend it for interactive MCP-client usage.

## Implementation notes

The server-side surface (in `mcp/src/ai/`) is:

```ts
// sampling-first wrapper — tries client sampling, falls back to direct API.
import { askClient } from "./sampling.js";
const response = await askClient(server, {
  messages: [...],
  system: "...",
  modelPreferences: { hints: [{ name: "claude-sonnet" }] },
  maxTokens: 512,
});
```

`askClient` checks (in order):

1. **Client capability** — does the connected MCP client advertise `sampling`? If yes, use `server.request({ method: "sampling/createMessage", params })`.
2. **`ANTHROPIC_API_KEY` env var set** — fall back to the Anthropic SDK directly.
3. **Neither available** — throw a structured error tagged `llm_unavailable` so the tool can degrade gracefully (e.g. `suggest_headlines` returns a deterministic placeholder instead of crashing).

Tools that have a deterministic fallback (e.g. `pick_brand_color` can run a colour-quantisation algorithm without an LLM) prefer that fallback when LLM is unavailable, rather than failing.

## When sampling isn't supported

Some MCP clients (and some MCP-compatible non-Claude tools) don't yet implement client-side sampling. The fallback chain above means:

- If the client supports sampling → use it (no key needed, no extra config).
- If the client doesn't support sampling but the user set `ANTHROPIC_API_KEY` → direct API path.
- If neither → tools that need LLM gracefully degrade (return deterministic placeholders, never crash).

This means **rc.1 works in every MCP client today** — because rc.1 has no LLM-requiring tools. By the time vision tools arrive in rc.3, client-side sampling support is expected to be near-universal.

## Future: multi-provider sampling preferences

MCP sampling lets the server hint at provider preferences (`modelPreferences.hints`). When OpenAI / Anthropic / Gemini all support MCP sampling natively from their respective IDEs, this server will pass hints like `{ hints: [{ name: "claude-sonnet" }, { name: "gpt-4o" }] }` so the client can pick the best available model. The server doesn't care which.
