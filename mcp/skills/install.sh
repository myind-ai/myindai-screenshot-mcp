#!/usr/bin/env sh
# myindai-screenshot-mcp — install the Claude Code skill.
# Run via: curl -fsSL https://raw.githubusercontent.com/myind-ai/myindai-screenshot-mcp/main/skills/install.sh | sh

set -eu

REPO="myind-ai/myindai-screenshot-mcp"
DEST="${HOME}/.claude/skills"
TMP="$(mktemp -d)"

echo "→ cloning ${REPO} to ${TMP}…"
git clone --depth 1 "https://github.com/${REPO}.git" "${TMP}/repo" >/dev/null

mkdir -p "${DEST}"
echo "→ installing every skill under skills/ into ${DEST}/ …"
for SRC in "${TMP}/repo/skills"/*/; do
  NAME="$(basename "${SRC}")"
  if [ -f "${SRC}/SKILL.md" ]; then
    rm -rf "${DEST:?}/${NAME}"
    cp -r "${SRC}" "${DEST}/${NAME}"
    echo "  ✓ ${NAME}"
  fi
done

echo "→ cleaning up…"
rm -rf "${TMP}"

cat <<EOF

✅ Skill installed at ${DEST}/${SKILL_NAME}/SKILL.md

Next, add the MCP server itself (if you haven't already):

  claude mcp add myindai-screenshot -- npx -y myindai-screenshot-mcp

Or hand-edit your client's mcp_config.json with:

  {
    "mcpServers": {
      "myindai-screenshot": {
        "command": "npx",
        "args": ["-y", "myindai-screenshot-mcp"]
      }
    }
  }

Restart your client. Say things like "make App Store screenshots for my app"
to trigger the skill.

EOF
