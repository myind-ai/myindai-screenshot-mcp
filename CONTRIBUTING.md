# Contributing to myindai-screenshot-mcp

Thanks for your interest in contributing. This guide covers local setup, the clean-room rewrite policy, the PR process, and the smoke gate.

## Local setup

```bash
git clone https://github.com/myind-ai/myindai-screenshot-mcp.git
cd myindai-screenshot-mcp/mcp
npm install
npx playwright install chromium
npm run build
npm run smoke
```

If smoke passes locally you have a working development environment. The MCP server is in `mcp/` (TypeScript) and the renderer is in `mcp/frontend/` (vanilla HTML / ES modules / three.js — no build step required).

## The clean-room rewrite policy (read before opening a renderer PR)

The renderer in `mcp/frontend/` is being re-implemented from scratch against a behavioural spec ([docs/clean-room-rewrite.md](docs/clean-room-rewrite.md)). To keep its provenance auditable:

1. If you have read the legacy renderer source at `github.com/YUZU-Hub/appscreen` (or in our private `shaantanu9/appscreen-legacy-backup` repo) you may not contribute renderer code. You can contribute to `mcp/` (server) freely.
2. Renderer PRs must reference the section of `docs/clean-room-rewrite.md` (or the MCP server source contract) that motivated the change. The PR description includes the line: *"I have not read the YUZU-Hub appscreen renderer source."*
3. Each renderer commit message follows the form `renderer: <subsystem>: <change> (clean-room, from spec §<n>)` for the audit trail.

If you're unsure whether your background disqualifies you, ask in an issue first — we'll find a way to involve you.

## PR process

1. Open an issue describing the change first if it's non-trivial (anything beyond a typo or a one-line fix).
2. Branch from `main`. Branch name: `feat/<topic>`, `fix/<topic>`, `chore/<topic>`, or `renderer/<topic>`.
3. Each commit message is one sentence, imperative tense, no period.
4. PR description includes: **what** changed, **why** it's a good idea, and **how** you verified it (commands you ran, smoke output, visual diff).
5. CI must be green.
6. One review approval required for merge. Reviewers will check at minimum: clean-room compliance (for renderer PRs), tests, no secrets, no `console.log` left behind.

## Smoke gate

`npm run smoke` runs the minimal end-to-end test. It must pass on every PR. If your change deliberately changes rendered output, you regenerate the smoke fixture and explain why in the PR description.

## Style

- **TypeScript:** strict mode, no `any` without a comment explaining the unavoidable widening. Prefer `unknown` + narrowing.
- **Vanilla JS in the renderer:** ES2022, no transpiler, no bundler. Use ES module imports from local files only. If you need a library, propose it in an issue first — we want to keep the renderer dependency-free.
- **No comments that explain WHAT.** Only WHY. Good identifiers explain WHAT.
- **No frameworks in the renderer.** Adding React / Vue / Svelte is a non-starter — the renderer ships as static HTML so the published npm package is self-contained and tiny.

## File size budgets

- `mcp/frontend/app.js`: target ≤ 50 KB minified.
- `mcp/frontend/three-renderer.js`: target ≤ 20 KB minified.
- `mcp/frontend/index.html`: target ≤ 5 KB.
- Total renderer footprint excluding three.js library and `.glb` models: target ≤ 100 KB.

These are soft caps. If you need to bust them, justify it in the PR.

## Reporting bugs

Use the bug-report issue template. Include:

- Your MCP client + version (Claude Desktop / Code / Cursor / Windsurf / Cline)
- `--doctor` output
- The exact tool call that failed and the full server stderr
- A minimal reproducible input

## Security

Do not open a public issue for security problems. Email `support@myind.ai` instead.
