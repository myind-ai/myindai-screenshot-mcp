#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverPath = path.resolve(__dirname, "..", "dist", "server.js");
const repoRoot = path.resolve(__dirname, "..", "..");

interface JsonRpc {
  jsonrpc: "2.0";
  id: number;
  result?: any;
  error?: { code: number; message: string };
}

interface ClipSpec {
  file: string;
  headline?: string;
  subheadline?: string;
  scene?: "tilt-in" | "rotate-360" | "float" | "fade-in" | "zoom-in";
}

interface CliOptions {
  inputDir: string;
  outputPath: string;
  tempDir: string;
  manifestPath?: string;
  fps: number;
  duration: number;
  device: "iphone-6.9" | "iphone-6.7" | "iphone-6.5" | "iphone-5.5";
  background: string;
  defaultScene: "tilt-in" | "rotate-360" | "float" | "fade-in" | "zoom-in";
}

function startServer() {
  const proc = spawn("node", [serverPath], {
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
    let idx;
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
      } catch {}
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

function run(cmd: string, args: string[], cwd: string) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, {
      cwd,
      stdio: "inherit",
      env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH || ""}` },
    });
    p.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}`));
    });
  });
}

function parseArgs(argv: string[]): CliOptions {
  const arg = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const has = (name: string) => argv.includes(name);
  if (has("--help") || has("-h")) {
    printHelp();
    process.exit(0);
  }

  const inputDir = arg("--input-dir");
  if (!inputDir) throw new Error("Missing required --input-dir");

  const resolvedInput = path.isAbsolute(inputDir) ? inputDir : path.resolve(process.cwd(), inputDir);
  const folderName = path.basename(resolvedInput);
  const outputPath =
    arg("--output") ||
    path.join(repoRoot, "appscreen-output", `${folderName}-3d-production-showcase.mp4`);
  const tempDir =
    arg("--temp-dir") ||
    path.join(repoRoot, "appscreen-output", `${folderName}-video-clips`);

  return {
    inputDir: resolvedInput,
    outputPath: path.isAbsolute(outputPath) ? outputPath : path.resolve(process.cwd(), outputPath),
    tempDir: path.isAbsolute(tempDir) ? tempDir : path.resolve(process.cwd(), tempDir),
    manifestPath: arg("--manifest"),
    fps: Number(arg("--fps") || "24"),
    duration: Number(arg("--duration") || "2.2"),
    device: (arg("--device") as CliOptions["device"]) || "iphone-6.7",
    background: arg("--background") || "Pacific Sunset",
    defaultScene: (arg("--scene") as CliOptions["defaultScene"]) || "tilt-in",
  };
}

function printHelp() {
  console.log(`
render-showcase - Generic 3D app showcase video renderer

Required:
  --input-dir <path>          Directory with screenshots (png/jpg/jpeg/webp)

Optional:
  --manifest <path>           JSON array with per-clip config:
                              [{ "file": "1_home.png", "headline": "...", "subheadline": "...", "scene": "tilt-in" }]
  --output <path>             Final mp4 path
  --temp-dir <path>           Directory for intermediate clip mp4s
  --fps <number>              Default: 24
  --duration <seconds>        Default: 2.2 (per clip)
  --device <id>               iphone-6.9 | iphone-6.7 | iphone-6.5 | iphone-5.5 (default iphone-6.7)
  --background <preset>       Default: Pacific Sunset
  --scene <name>              Default clip scene when manifest omits scene

Examples:
  npx tsx scripts/render-showcase.ts --input-dir ../kaabil_screenshot/best/6.7
  npx tsx scripts/render-showcase.ts --input-dir ./myapp/screens --manifest ./myapp/manifest.json --output ../appscreen-output/myapp.mp4
`);
}

function guessHeadline(fileName: string): string {
  const base = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/^[0-9]+[_-]?/, "")
    .replace(/[_-]+/g, " ")
    .trim();
  const words = base
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return words.join(" ") || "Feature Highlight";
}

function guessSubheadline(fileName: string): string {
  const base = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/^[0-9]+[_-]?/, "")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!base) return "Showcase key product value in motion";
  return `${base.charAt(0).toUpperCase()}${base.slice(1).toLowerCase()} in a polished 3D showcase`;
}

async function buildClipSpecs(opts: CliOptions): Promise<ClipSpec[]> {
  if (opts.manifestPath) {
    const p = path.isAbsolute(opts.manifestPath)
      ? opts.manifestPath
      : path.resolve(process.cwd(), opts.manifestPath);
    const raw = await fs.readFile(p, "utf8");
    const data = JSON.parse(raw);
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("Manifest must be a non-empty JSON array");
    }
    return data as ClipSpec[];
  }

  const dirEntries = await fs.readdir(opts.inputDir);
  const files = dirEntries
    .filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (files.length === 0) throw new Error(`No images found in ${opts.inputDir}`);

  return files.slice(0, 12).map((f) => ({
    file: f,
    headline: guessHeadline(f),
    subheadline: guessSubheadline(f),
  }));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  await fs.mkdir(path.dirname(opts.outputPath), { recursive: true });
  await fs.mkdir(opts.tempDir, { recursive: true });

  const clips = await buildClipSpecs(opts);
  const client = startServer();

  await client.call("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "render-showcase", version: "0.0.1" },
  });

  const renderedClipPaths: string[] = [];
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const imagePath = path.isAbsolute(clip.file) ? clip.file : path.join(opts.inputDir, clip.file);
    const outputPath = path.join(opts.tempDir, `${String(i + 1).padStart(2, "0")}.mp4`);
    const res = await client.call("tools/call", {
      name: "render_video",
      arguments: {
        image: imagePath,
        output_path: outputPath,
        duration_seconds: opts.duration,
        fps: opts.fps,
        format: "mp4",
        scene: clip.scene || opts.defaultScene,
        intensity: 0.9,
        output_device: opts.device,
        base: {
          headline: clip.headline || guessHeadline(path.basename(imagePath)),
          subheadline: clip.subheadline || guessSubheadline(path.basename(imagePath)),
          mode: "3d",
          background_preset: opts.background,
          text_color: "light",
          screenshot: {
            shadow: { enabled: true, color: "#3B0823", blur: 96, opacity: 38, x: 0, y: 36 },
          },
          text: {
            font: "Inter",
            headlineWeight: "900",
            subheadlineWeight: "600",
            headlineSize: 98,
            subheadlineSize: 38,
          },
        },
      },
    });

    if (res.result?.isError) {
      throw new Error(`render_video failed for ${clip.file}: ${res.result.content?.[0]?.text || "unknown error"}`);
    }
    renderedClipPaths.push(outputPath);
    console.error(`[render-showcase] rendered ${path.basename(outputPath)} from ${path.basename(imagePath)}`);
  }

  client.close();

  const concatPath = path.join(opts.tempDir, "concat.txt");
  const concatBody = renderedClipPaths.map((p) => `file '${p}'`).join("\n");
  await fs.writeFile(concatPath, `${concatBody}\n`, "utf8");

  await run(
    "ffmpeg",
    [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatPath,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      opts.outputPath,
    ],
    repoRoot
  );

  console.error(`\n[render-showcase] Final video: ${opts.outputPath}`);
}

main().catch((err) => {
  console.error("[render-showcase] fatal:", err);
  process.exit(1);
});
