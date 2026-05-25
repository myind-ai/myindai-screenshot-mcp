# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned for v1.0.0-rc.2

- `pick_brand_color`, `extract_palette`, `suggest_headlines` (vision tools)
- 3 additional templates: `dark-premium`, `vibrant-gradient`, `big-number`
- Re-sourced `info.svg`, `laurel.svg` (clean provenance), `iphone-15-pro-max.glb`, `samsung-galaxy-s25-ultra.glb`
- Re-enable `render_ab_variants`, `render_aso_set`, `render_multi_size`

### Planned for v1.1.0

- Re-enable video pipeline: `render_video`, `render_video_template`, `render_video_concept`, `auto_video`

### Planned for v1.2.0+ (Sprints 2–5)

- Brand kit / Figma import (Sprint 2)
- A/B conversion intelligence (Sprint 3)
- AI 3D scenes & motion graphics (Sprint 4)
- Direct ASC / Play upload tools (Sprint 5)

## [1.0.0-rc.1] — 2026-05-25 — Clean-room preview

**This is the initial public release of myindai-screenshot-mcp under MIT license. It is the result of a complete clean-room rewrite of the renderer that was previously sourced from a no-license upstream.**

### Added

- MCP server (`mcp/`) carried forward from the v0.5.1 private development line (25 tool surfaces, all original work by shaantanu9).
- New top-level project documentation: README, LICENSE (MIT), CONTRIBUTING, CODE_OF_CONDUCT, NOTICE, ASSETS.
- Clean-room rewrite documentation (`docs/clean-room-rewrite.md`) — the behavioural spec the renderer was rewritten against.
- Architecture document (`docs/architecture.md`) — server/renderer contract.
- Manual TODO tracker (`docs/manual-todo/`).
- New `mcp/frontend/index.html` + `app.js` + `three-renderer.js` + `styles.css`: ground-up implementation of the `window.__mcp` contract. Initial scope: `render_screenshot` for 1 template (`clean-minimal`) on 1 device frame.
- `myind.ai` GitHub organisation set up; repo lives at `github.com/myind-ai/myindai-screenshot-mcp`.

### Changed

- Project renamed: `appscreen-mcp` → `myindai-screenshot-mcp`.
- License clarified: MIT, copyright Shantanu Bombatkar / myind.ai.
- Author moved from npm handle `shaantanu98` to full name.
- Repository moved from personal `shaantanu9/appscreen` to org `myind-ai/myindai-screenshot-mcp`.

### Removed

- All renderer code traceable to `github.com/YUZU-Hub/appscreen` (no licence). Replaced with original implementation written from scratch.
- All assets traceable to YUZU-Hub upstream (`info.svg`, laurel SVGs, device `.glb` files) — temporarily replaced with placeholders. Real assets land in v1.0.0-rc.2 with provenance logged in `ASSETS.md`.
- The legacy `Abhishek_Mansi.mp4` test artefact (excluded from both new repos via `.gitignore`).
- `mcp-output/` runtime directory and `*.tgz` build artefacts (gitignored).

### Security

- Defence-in-depth `.gitignore` entries for `.env`, `.pem`, `.key`, `.p8`, `secrets.json`.
- Repository-wide secret scan run before initial commit; no secrets found.

### Known limitations of v1.0.0-rc.1

- Only `render_screenshot` produces real output; other tools are stubs that respond with "coming in v1.0.0-rc.2" until the renderer covers their templates.
- Only 1 of the planned 5 templates is implemented (`clean-minimal`).
- Only 1 of the planned 2 device frames is implemented; the renderer uses runtime-generated placeholder geometry instead of a real `.glb` model.
- The legacy `appscreen-mcp` npm package (v0.5.1) is not yet deprecated; it will be marked deprecated when v1.0.0 ships (post-rc cycle).
- Repository visibility: private during the rc cycle, will flip to public when v1.0.0 ships.
