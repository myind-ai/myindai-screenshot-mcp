# Asset provenance

Every binary asset shipped with this project has its source, licence, and acquisition date logged here. If you add a new asset, append a row.

## SVG icons (`mcp/frontend/img/`)

| File | Source | Licence | Acquired | Notes |
|---|---|---|---|---|
| _none yet_ | — | — | — | v1.0.0-rc.1: the renderer ships icon-free. Acquired in v1.0.0-rc.2. |

Planned for v1.0.0-rc.2:

- `info.svg` — Lucide Icons (ISC). Will be downloaded from https://lucide.dev. Lucide credit goes in `NOTICE`.
- `laurel.svg` — Drawn from scratch as SVG paths and committed inline. Original to myind.ai.

## 3D device models (`mcp/frontend/models/`)

| File | Source | Licence | Acquired | Notes |
|---|---|---|---|---|
| _none yet_ | — | — | — | v1.0.0-rc.1: ships placeholder geometry generated at runtime by three.js. Acquired in v1.0.0-rc.2. |

Planned for v1.0.0-rc.2 (each must be verified before commit):

- `iphone-15-pro-max.glb` — Sketchfab CC0 search OR Apple Marketing Resources. Required: licence terms screenshot saved under `assets/_provenance/<file>.md`.
- `samsung-galaxy-s25-ultra.glb` — Sketchfab CC0 search OR Samsung Newsroom mockup. Same provenance requirements.

## Sample app screenshots (`assets/img/` or examples)

| File | Source | Licence | Acquired | Notes |
|---|---|---|---|---|
| _none yet_ | — | — | — | Sample shots will be the author's own apps (Kaabil, Unmute, Frequensea). |

## Provenance evidence

For every binary asset that didn't originate with the author, a sibling Markdown file is committed under `assets/_provenance/<filename>.md` with:

- Direct download URL
- Licence URL or terms screenshot
- Date acquired (UTC)
- Acquirer (GitHub handle)
- SHA-256 of the file at acquisition time

This is the audit trail. If a question is raised about a file later, we can show exactly where it came from.

## Rule

If a binary asset is in this repository and isn't listed in this file with a row, that's a bug — please open an issue or submit a PR adding the row.
