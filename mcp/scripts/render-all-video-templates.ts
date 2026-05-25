#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const mcpRoot = path.resolve(__dirname, "..");
const serverPath = path.resolve(mcpRoot, "dist", "server.js");

interface JsonRpc {
  jsonrpc: "2.0";
  id: number;
  result?: any;
  error?: { code: number; message: string };
}

interface TemplateInfo {
  slug: string;
  name: string;
  style: string;
  scenes: number;
  total_seconds: number;
  ideal_screens: number;
  fps: number;
  source: string;
}

function startServer() {
  const proc = spawn("node", [serverPath], {
    cwd: mcpRoot,
    stdio: ["pipe", "pipe", "inherit"],
    env: {
      ...process.env,
      PATH: `/opt/homebrew/bin:${process.env.PATH || ""}`,
      ANTHROPIC_API_KEY: "",
    },
  });

  let buf = "";
  const pending = new Map<number, (r: JsonRpc) => void>();
  proc.stdout.on("data", (chunk: Buffer) => {
    buf += chunk.toString("utf8");
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line) as JsonRpc;
        const cb = pending.get(msg.id);
        if (cb) {
          pending.delete(msg.id);
          cb(msg);
        }
      } catch {
        // ignore non-json lines
      }
    }
  });

  let nextId = 1;
  function call(method: string, params: any) {
    return new Promise<JsonRpc>((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }

  return {
    call,
    close: () => {
      proc.stdin.end();
      proc.kill();
    },
  };
}

function timestampSlug() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}_${hh}-${mi}`;
}

async function main() {
  const inputDir = path.join(repoRoot, "img", "kaabil_screenshot");
  const outDir = path.join(repoRoot, "appscreen-output", `kaabil-template-video-test-${timestampSlug()}`);
  await fs.mkdir(outDir, { recursive: true });

  const files = await fs.readdir(inputDir);
  const images = files
    .filter((f) => /^\d+_.*\.png$/i.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((f) => path.join(inputDir, f));

  if (images.length === 0) {
    throw new Error(`No numbered screenshots found in ${inputDir}`);
  }

  const client = startServer();
  await client.call("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "render-all-video-templates", version: "0.0.1" },
  });

  const listRes = await client.call("tools/call", { name: "list_video_templates", arguments: {} });
  if (listRes.result?.isError) {
    throw new Error(listRes.result.content?.[0]?.text || "Failed to list templates");
  }
  const templates = JSON.parse(listRes.result.content[0].text) as TemplateInfo[];
  if (!templates.length) {
    throw new Error("No templates returned by list_video_templates");
  }

  const rows: string[] = [];
  rows.push("# Kaabil Template Video Batch");
  rows.push("");
  rows.push(`Output folder: \`${outDir}\``);
  rows.push(`Input screenshots: ${images.length}`);
  rows.push(`Templates: ${templates.length}`);
  rows.push("");
  rows.push("| Template | Output | Status |");
  rows.push("|---|---|---|");

  for (let i = 0; i < templates.length; i++) {
    const t = templates[i];
    const outPath = path.join(outDir, `${String(i + 1).padStart(2, "0")}-${t.slug}.mp4`);
    process.stderr.write(`[batch] ${i + 1}/${templates.length} rendering ${t.slug}\n`);

    const r = await client.call("tools/call", {
      name: "render_video_template",
      arguments: {
        template: t.slug,
        images,
        output_path: outPath,
        app_name: "Kaabil",
        output_device: "iphone-6.9",
        fps: 30,
        language: "en",
        mode: "3d",
      },
    });

    if (r.result?.isError) {
      const err = (r.result.content?.[0]?.text || "error").replace(/\n/g, " ");
      rows.push(`| \`${t.slug}\` | \`${path.basename(outPath)}\` | FAIL: ${err} |`);
      continue;
    }

    rows.push(`| \`${t.slug}\` | \`${path.basename(outPath)}\` | OK |`);
  }

  const reportPath = path.join(outDir, "REPORT.md");
  await fs.writeFile(reportPath, rows.join("\n") + "\n", "utf8");
  client.close();

  process.stderr.write(`\n[batch] done\n[batch] folder: ${outDir}\n[batch] report: ${reportPath}\n`);
}

main().catch((e) => {
  process.stderr.write(`[batch] fatal: ${e?.message || String(e)}\n`);
  process.exit(1);
});

