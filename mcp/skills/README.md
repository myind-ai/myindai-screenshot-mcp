# Skills

Drop-in Claude Code / Cursor / Windsurf / Cline skills that pair with `myindai-screenshot-mcp`.

| Skill | What it does | Triggers |
|---|---|---|
| [`myindai-screenshot`](./myindai-screenshot/SKILL.md) | Install + setup + basic workflow — install check, brand discovery, render, iterate, set/variants/sizes, CLI fallback. Start here if the MCP server isn't connected yet. | "App Store screenshot", "Play Store screenshot", "ASO", "render this screenshot", "marketing screenshot", "screenshot template", "2D vs 3D device", and ~20 other phrases. |
| [`myindai-screenshot-templates`](./myindai-screenshot-templates/SKILL.md) | **Design recipes (battle-tested).** 10 named template archetypes (5 2D + 5 3D), the canvas math that prevents text-device overlap, panoramic split for paired adjacent screenshots, source-frame selection rules, renderer-feature support matrix (which template needs which rc). | "screenshot templates", "3D screenshot", "vibrant gradient", "dark premium", "big-number template", "glass aurora", "neon perspective", "ocean hero", "gold premium", "panoramic screenshot", "screenshot layout math", "iPhone 6.9", and ~10 other phrases. |

## Install (Claude Code)

**Fastest — via the npm package (installs all skills bundled with this release):**

```bash
npx -y myindai-screenshot-mcp --install-skill
```

That single line copies every `skills/<name>/SKILL.md` from the published tarball into `~/.claude/skills/`. Restart Claude Code to pick up the new skills.

**Alternative — clone + copy:**

```bash
git clone https://github.com/myind-ai/myindai-screenshot-mcp.git /tmp/m
mkdir -p ~/.claude/skills
cp -r /tmp/m/skills/* ~/.claude/skills/
rm -rf /tmp/m
```

**Or — `curl | sh` one-liner (clones in the background):**

```bash
curl -fsSL https://raw.githubusercontent.com/myind-ai/myindai-screenshot-mcp/main/skills/install.sh | sh
```

Then add the MCP server too:

```bash
claude mcp add myindai-screenshot -- npx -y myindai-screenshot-mcp
```

## Install (other clients)

For Cursor / Windsurf / Cline, copy the `myindai-screenshot/` directory into your client's skills/snippets folder per its convention, then add the MCP server config block to your client's `mcp_config.json`:

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

Restart the client. Skills activate automatically when their trigger phrases appear in user messages.

## Contributing a new skill

Skills here follow Claude Code's [skill convention](https://docs.claude.com/en/docs/claude-code/skills):

```
skills/
└── <skill-name>/
    └── SKILL.md   ← required, with YAML frontmatter (name + description) + body
```

- `name` in the frontmatter must match the folder name.
- `description` should include 5+ trigger phrases.
- Body should have: when-to-invoke, phased workflow, gotchas table, install snippet.
- One-shot tests welcome under `<skill-name>/tests/`.

Open a PR with the new skill folder.
