# Tools reference + Claude Code skill

**Date:** 2026-05-26
**Type:** Documentation / Feature (developer experience)

## Summary

Adds two pieces that turn `myindai-screenshot-mcp` from "an MCP server" into "an end-to-end ASO workflow anyone can install in 30 seconds":

- **`TOOLS.md`** — exhaustive reference for all 25 tool surfaces, the 5 MCP resources (`myindai://*`), the registered prompts, every env var, and workflow recipes. Status table is the source of truth for "what works in v1.0.0-rc.2 vs what's deferred."
- **`skills/myindai-screenshot/SKILL.md`** — drop-in Claude Code skill (with proper YAML frontmatter + trigger phrases) that orchestrates the tools into a phased workflow: install check → brand discovery → render → iterate → set/variants/sizes. Covers 2D and 3D paths and MCP and CLI modes.
- **`skills/install.sh`** — one-liner installer that clones the repo, copies the skill into `~/.claude/skills/`, and prints the MCP-add command.
- **`skills/README.md`** — index of skills + contribution guide for new ones.

## Changes

- `TOOLS.md` — new, top-level. ~290 lines.
- `skills/myindai-screenshot/SKILL.md` — new. Claude Code skill with 25 trigger phrases, 5 phases (verify install → discovery → render → iterate → set/variants), 2D/3D guidance, CLI usage, gotchas table.
- `skills/README.md` — new. Index + install instructions per client (Claude Code, Cursor, Windsurf, Cline).
- `skills/install.sh` — new, executable. Used via `curl … | sh`.
- `README.md` — added "Tools reference + Claude Code skill" section above Contributing.

## Files Created

- `TOOLS.md`
- `skills/README.md`
- `skills/install.sh`
- `skills/myindai-screenshot/SKILL.md`
- `changelogs/2026-05-26_02_tools-reference-and-skill.md` (this file)

## Files Modified

- `README.md` — links to TOOLS.md and the skill folder.

## Verification

- `bash skills/install.sh --help` is a no-op (script ignores args), exits clean.
- Skill frontmatter parses (single `name`, `description` block, 25 trigger phrases).
- `TOOLS.md` table reconciles with the implementation status documented in `mcp/src/server.ts` and the README status badges.
- No new npm publish required — these are docs + skill, not code.
