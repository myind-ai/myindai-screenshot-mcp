# Skills

Drop-in Claude Code / Cursor / Windsurf / Cline skills that pair with `myindai-screenshot-mcp`.

| Skill | What it does | Triggers |
|---|---|---|
| [`myindai-screenshot`](./myindai-screenshot/SKILL.md) | Full ASO pipeline — install check, brand discovery, render, iterate, set/variants/sizes, 2D & 3D, CLI fallback. | "App Store screenshot", "Play Store screenshot", "ASO", "render this screenshot", "marketing screenshot", "screenshot template", "2D vs 3D device", and ~20 other phrases listed in the skill frontmatter. |

## Install (Claude Code)

One-liner:

```bash
curl -fsSL https://raw.githubusercontent.com/myind-ai/myindai-screenshot-mcp/main/skills/install.sh | sh
```

Or manually:

```bash
git clone https://github.com/myind-ai/myindai-screenshot-mcp.git /tmp/m
mkdir -p ~/.claude/skills
cp -r /tmp/m/skills/myindai-screenshot ~/.claude/skills/
rm -rf /tmp/m
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
