import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Locate the frontend assets (`index.html`, `app.js`, …, `models/`) the
// renderer loads via Playwright. Two supported layouts:
//
//   1. Dev / monorepo: this file lives at <repo>/mcp/{src,dist}/config.* and
//      the assets sit at <repo>/index.html.
//   2. Published npm package: `prepack` copies the assets next to dist/ as
//      <pkg>/frontend/index.html so the package is self-contained.
//
// We probe candidates in priority order and use the first one with index.html.
function resolveFrontendRoot(): string {
  const candidates = [
    path.resolve(__dirname, "..", "frontend"),       // published npm layout (dist/../frontend)
    path.resolve(__dirname, "..", "..", "frontend"), // src→pkg or dist→pkg via parent
    path.resolve(__dirname, "..", ".."),             // dev: <repo>/mcp/{src,dist} → <repo>
    path.resolve(__dirname, "..", "..", ".."),       // dev with deeper nesting
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "index.html"))) return candidate;
  }
  // Fall back to the dev path so the error message points somewhere useful.
  return path.resolve(__dirname, "..", "..");
}

export const FRONTEND_ROOT = resolveFrontendRoot();
// Back-compat alias — older code referenced REPO_ROOT.
export const REPO_ROOT = FRONTEND_ROOT;
export const INDEX_HTML_PATH = path.join(FRONTEND_ROOT, "index.html");
export const INDEX_HTML_URL = `file://${INDEX_HTML_PATH}`;

export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-7";
export const PAGE_POOL_SIZE = parseInt(process.env.MCP_PAGE_POOL || "1", 10);
export const IDLE_SHUTDOWN_MS = parseInt(
  process.env.MCP_IDLE_SHUTDOWN_MS || "60000",
  10
);
export const MAX_IMAGE_BYTES = parseInt(
  process.env.MCP_MAX_IMAGE_BYTES || String(10 * 1024 * 1024),
  10
);
