# Launch — manual TODOs

## Before v1.0.0-rc.1 ships (today)

- [x] Create `myind-ai` GitHub org — **done 2026-05-25 16:02 UTC**
- [ ] **BLOCKER** — Verify `npm whoami` returns the account you want to publish from. If wrong, `npm login`.
- [ ] **BLOCKER** — Decide repo visibility for v1.0.0-rc.1: private during rc cycle (recommended) vs public from day one. (Default in spec: private until rc1 smoke is green.)
- [ ] Run `gh auth refresh -h github.com -s admin:org` if we want to script future org-repo settings changes. (Not blocking for v1.0.0-rc.1.)

## Before v1.0.0-rc.2 (asset re-sourcing)

- [ ] Acquire `iphone-15-pro-max.glb` from one of:
  - Sketchfab — search "iPhone 15 Pro Max" filter CC0. Save provenance screenshot.
  - Apple Marketing Resources — https://developer.apple.com/app-store/marketing/guidelines/
  - Commission an artist (~$50–200).
- [ ] Acquire `samsung-galaxy-s25-ultra.glb` from one of:
  - Sketchfab CC0
  - Samsung Newsroom mockups — https://news.samsung.com/global/category/mobile-communications
- [ ] Acquire `info.svg` from Lucide Icons (ISC, https://lucide.dev/icons/info). Add Lucide credit to `NOTICE`.
- [ ] Decide laurel SVG approach: draw from scratch (recommended, ~30 min) or use a public-domain decorative source (must document in `ASSETS.md`).
- [ ] For every acquired asset, save a provenance file at `assets/_provenance/<filename>.md` with download URL, licence URL, date acquired, SHA-256.

## Before v1.0.0 (true open-source launch)

- [ ] Flip GitHub repo visibility: private → public.
- [ ] `npm publish --access public` from `mcp/` directory.
- [ ] Tag `v1.0.0` and create a GitHub release.
- [ ] `npm deprecate appscreen-mcp "Renamed to myindai-screenshot-mcp (clean-room rewrite, 100% original code)."`
- [ ] Update the existing `appscreen-mcp` README on npm to redirect to `myindai-screenshot-mcp` (optional but kind to existing users).
- [ ] Add the project to https://github.com/punkpeye/awesome-mcp-servers via PR (good discovery).
- [ ] Announce on Hacker News / Twitter / Bluesky / r/iOSProgramming + r/androiddev / Indie Hackers — see `docs/launch-announcement.md` (to be written closer to v1.0.0).

## Ongoing operational

- [ ] Set up Dependabot via `.github/dependabot.yml` once repo is public (security alerts only initially).
- [ ] Enable GitHub Secret Scanning Push Protection on the public repo.
- [ ] Set up a CI key for `ANTHROPIC_API_KEY` once we add vision-tool smoke (after v1.0.0-rc.3).
