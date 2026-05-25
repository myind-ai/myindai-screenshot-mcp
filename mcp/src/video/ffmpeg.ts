import { spawn } from "node:child_process";
import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const execFile = promisify(execFileCb);

// ----------------------------------------------------------------------------
// ffmpeg / ffprobe path resolution
// ----------------------------------------------------------------------------
// MCP gotcha: Claude Desktop / Cursor / Windsurf launch the server with a
// minimal PATH that does NOT include the user's shell PATH. So even though
// `which ffmpeg` works in their terminal (which loads ~/.zshrc → adds
// /opt/homebrew/bin), our spawned process can't find it. We:
//   1. Honor explicit env overrides (FFMPEG_PATH / FFPROBE_PATH) — the escape hatch.
//   2. Try the inherited PATH first (works on most Linux + when launched from
//      a shell with full PATH).
//   3. Fall back to probing a hardcoded list of standard install locations
//      (Homebrew Apple-Silicon, Homebrew Intel, Linux package managers,
//      ffmpeg.org "static-builds" common spots).
//   4. Cache the resolved absolute path so subsequent calls are free.
//   5. Surface a SHELL-ready error listing every path tried + the install
//      command for the platform — so the user can act on it without guessing.

const COMMON_FFMPEG_PATHS = [
  "/opt/homebrew/bin/ffmpeg",       // macOS Apple Silicon (Homebrew)
  "/usr/local/bin/ffmpeg",          // macOS Intel (Homebrew) + many Linux installs
  "/usr/bin/ffmpeg",                // Debian/Ubuntu apt
  "/snap/bin/ffmpeg",               // Snap
  "/var/lib/flatpak/exports/bin/ffmpeg", // Flatpak
  "/opt/local/bin/ffmpeg",          // MacPorts
  "/home/linuxbrew/.linuxbrew/bin/ffmpeg", // Linuxbrew
  "C:\\ffmpeg\\bin\\ffmpeg.exe",    // Windows manual install
  "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe",
];

const COMMON_FFPROBE_PATHS = COMMON_FFMPEG_PATHS.map((p) =>
  p.replace(/ffmpeg(\.exe)?$/, "ffprobe$1")
);

let cachedFfmpegPath: string | null = null;
let cachedFfprobePath: string | null = null;

async function fileIsExecutable(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function resolveBinary(
  binName: "ffmpeg" | "ffprobe",
  envOverride: string | undefined,
  candidatePaths: string[]
): Promise<string | null> {
  // 1. Explicit env override.
  if (envOverride && envOverride.trim()) {
    const p = envOverride.trim();
    if (await fileIsExecutable(p)) return p;
    // If the override points at a directory, append the binary.
    try {
      const stat = await fs.stat(p);
      if (stat.isDirectory()) {
        const inDir = path.join(p, process.platform === "win32" ? `${binName}.exe` : binName);
        if (await fileIsExecutable(inDir)) return inDir;
      }
    } catch {
      /* fall through */
    }
  }

  // 2. Inherited PATH — execFile resolves via PATH automatically.
  try {
    const { stdout } = await execFile(binName, ["-version"]);
    if (stdout.toLowerCase().includes(binName)) return binName;
  } catch {
    /* not in PATH — keep probing */
  }

  // 3. Hardcoded common locations.
  for (const candidate of candidatePaths) {
    if (await fileIsExecutable(candidate)) {
      try {
        const { stdout } = await execFile(candidate, ["-version"]);
        if (stdout.toLowerCase().includes(binName)) return candidate;
      } catch {
        /* exists but unusable — keep going */
      }
    }
  }

  return null;
}

function installHint(): string {
  if (process.platform === "darwin") {
    return "Install with: `brew install ffmpeg` (macOS).";
  }
  if (process.platform === "linux") {
    return "Install with: `apt install ffmpeg` (Debian/Ubuntu) or `dnf install ffmpeg` (Fedora).";
  }
  if (process.platform === "win32") {
    return "Install from https://ffmpeg.org/download.html and add the bin directory to PATH.";
  }
  return "Install ffmpeg from https://ffmpeg.org/download.html.";
}

export async function ensureFfmpeg(): Promise<string> {
  if (cachedFfmpegPath) return cachedFfmpegPath;

  const found = await resolveBinary("ffmpeg", process.env.FFMPEG_PATH, COMMON_FFMPEG_PATHS);
  if (found) {
    cachedFfmpegPath = found;
    if (process.env.APPSCREEN_DEBUG)
      process.stderr.write(`[appscreen-mcp] resolved ffmpeg at ${found}\n`);
    return found;
  }

  const tried = [
    process.env.FFMPEG_PATH ? `FFMPEG_PATH=${process.env.FFMPEG_PATH}` : null,
    "PATH (no match)",
    ...COMMON_FFMPEG_PATHS.map((p) => `  - ${p}`),
  ]
    .filter(Boolean)
    .join("\n");

  throw new Error(
    `ffmpeg not found. ${installHint()}\n` +
      `\n` +
      `MCP servers spawned by Claude Desktop / Cursor / Windsurf inherit a minimal PATH that often does not include /opt/homebrew/bin or /usr/local/bin. ` +
      `Either (a) add ffmpeg's directory to the launch env, e.g. set FFMPEG_PATH=/opt/homebrew/bin/ffmpeg in the MCP server config, ` +
      `or (b) symlink ffmpeg into a standard location.\n` +
      `\n` +
      `Tried:\n${tried}\n` +
      `Current PATH (as seen by the MCP process): ${process.env.PATH || "<empty>"}`
  );
}

export async function ensureFfprobe(): Promise<string> {
  if (cachedFfprobePath) return cachedFfprobePath;

  const found = await resolveBinary("ffprobe", process.env.FFPROBE_PATH, COMMON_FFPROBE_PATHS);
  if (found) {
    cachedFfprobePath = found;
    if (process.env.APPSCREEN_DEBUG)
      process.stderr.write(`[appscreen-mcp] resolved ffprobe at ${found}\n`);
    return found;
  }

  // ffprobe ships alongside ffmpeg in every standard distribution. If we found
  // ffmpeg but not ffprobe, that's an unusual install — surface it clearly.
  const haveFfmpeg = cachedFfmpegPath || (await ensureFfmpeg().catch(() => null));
  if (haveFfmpeg) {
    throw new Error(
      `ffprobe not found, but ffmpeg resolved at ${haveFfmpeg}. ffprobe should ship alongside ffmpeg. ` +
        `Try reinstalling ffmpeg, or set FFPROBE_PATH to its absolute path.`
    );
  }

  throw new Error(`ffprobe not found. ${installHint()} ffprobe ships with ffmpeg.`);
}

// ----------------------------------------------------------------------------
// Encoding
// ----------------------------------------------------------------------------

export interface EncodeOptions {
  outputPath: string;
  format: "mp4" | "gif" | "webm";
  fps: number;
  width: number;
  height: number;
  // Native fps that we're feeding ffmpeg. If `fps > nativeFps`, the encoder
  // upsamples to `fps` — by default with cheap frame duplication (visually
  // fine for slow camera moves like tilt/float/fade). Set `smoothMotion: true`
  // to opt into ffmpeg's `minterpolate` motion-estimated synthesis instead;
  // that's 5-10× more expensive at 1320×2868 but produces buttery motion for
  // fast-rotation or zoom scenes.
  nativeFps?: number;
  smoothMotion?: boolean;
  // Codec: 'auto' (default) → h264_videotoolbox on macOS, libx264 elsewhere.
  // 'libx264' forces software encoding (slower but max compatibility).
  videoCodec?: "auto" | "libx264" | "h264_videotoolbox" | "h264_nvenc";
  // Input encoding the frames are arriving in. 'jpeg' is much faster to base64
  // and pipe through Playwright IPC; 'png' is what the renderer originally used.
  inputFormat?: "png" | "jpeg";
}

function pickVideoCodec(prefer?: EncodeOptions["videoCodec"]): string {
  if (prefer && prefer !== "auto") return prefer;
  if (process.platform === "darwin") return "h264_videotoolbox"; // hardware-accelerated on macOS
  return "libx264";
}

/**
 * Encode an iterable of PNG/JPEG buffers into a video file.
 * Pipes PNG/JPEG-by-frame into ffmpeg's stdin via the image2pipe demuxer.
 *
 * Buffers all frames first when the codec is hardware-accelerated, so we can
 * retry with libx264 on failure (some ffmpeg builds, especially Linux apt or
 * Windows static builds, don't include videotoolbox/nvenc and would error out
 * on the first attempt). For the typical case the retry path is a no-op.
 */
export async function encodeFrames(
  frames: AsyncIterable<Buffer>,
  opts: EncodeOptions
): Promise<void> {
  // Materialize so we can retry. Memory cost: ~50KB per JPEG @ 1320×2868, so
  // 30sec @ 15fps native ≈ 22 MB — fine.
  const buffered: Buffer[] = [];
  for await (const f of frames) buffered.push(f);

  try {
    await runEncode(buffered, opts);
  } catch (e: any) {
    const msg = String(e?.message || e);
    const codec = pickVideoCodec(opts.videoCodec);
    const isHardwareCodec = codec === "h264_videotoolbox" || codec === "h264_nvenc";
    const looksLikeCodecMissing =
      isHardwareCodec &&
      (msg.includes("Encoder not found") ||
        msg.includes("Unknown encoder") ||
        msg.includes("not supported") ||
        msg.includes("Function not implemented") ||
        msg.includes("Operation not supported"));
    if (!looksLikeCodecMissing) throw e;
    process.stderr.write(
      `[appscreen-mcp] ${codec} encode failed (${msg.slice(0, 120)}…). Retrying with libx264.\n`
    );
    await runEncode(buffered, { ...opts, videoCodec: "libx264" });
  }
}

async function runEncode(buffered: Buffer[], opts: EncodeOptions): Promise<void> {
  const ffmpeg = await ensureFfmpeg();
  const ffmpegArgs = buildFfmpegArgs(opts);
  const proc = spawn(ffmpeg, ffmpegArgs, { stdio: ["pipe", "pipe", "pipe"] });

  const stderrChunks: Buffer[] = [];
  proc.stderr.on("data", (c: Buffer) => stderrChunks.push(c));

  const writeDone = new Promise<void>((resolve, reject) => {
    proc.stdin.on("error", (e) => {
      // EPIPE happens when ffmpeg has exited; we surface it via the close handler.
      if ((e as any)?.code !== "EPIPE") reject(e);
    });
    proc.stdin.on("close", () => resolve());
  });

  const closeDone = new Promise<void>((resolve, reject) => {
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else {
        const tail = Buffer.concat(stderrChunks).toString("utf8").split("\n").slice(-12).join("\n");
        reject(new Error(`ffmpeg exited with code ${code}\n${tail}`));
      }
    });
  });

  try {
    for (const buf of buffered) {
      const ok = proc.stdin.write(buf);
      if (!ok) await new Promise((r) => proc.stdin.once("drain", r));
    }
  } finally {
    proc.stdin.end();
  }

  await Promise.all([writeDone, closeDone]);
}

/**
 * Concatenate multiple MP4 clips with an `xfade` (cross-fade) between each pair.
 * Uses libx264 + yuv420p so the output is QuickTime/web-compatible. Used by the
 * spec-template renderer to join per-image clips into one continuous video.
 */
export async function concatWithXfade(clips: string[], outPath: string, xfadeSec: number): Promise<void> {
  const ffmpeg = await ensureFfmpeg();
  const ffprobe = await ensureFfprobe();

  if (clips.length === 0) throw new Error("concatWithXfade: no clips");
  if (clips.length === 1) {
    await execFile(ffmpeg, ["-y", "-i", clips[0], "-c", "copy", outPath]);
    return;
  }

  // Probe each clip's duration so we can compute cumulative xfade offsets.
  const durations: number[] = [];
  for (const c of clips) {
    const { stdout } = await execFile(ffprobe, [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      c,
    ]);
    durations.push(parseFloat(stdout.trim()));
  }

  const inputs: string[] = clips.flatMap((c) => ["-i", c]);
  const filters: string[] = [];
  let cumOffset = durations[0] - xfadeSec;
  let prev = "0:v";
  for (let i = 1; i < clips.length; i++) {
    const tag = i === clips.length - 1 ? "vout" : `v${i}`;
    filters.push(
      `[${prev}][${i}:v]xfade=transition=fade:duration=${xfadeSec}:offset=${cumOffset.toFixed(3)}[${tag}]`
    );
    prev = tag;
    cumOffset += durations[i] - xfadeSec;
  }

  const args = [
    ...inputs,
    "-filter_complex", filters.join(";"),
    "-map", "[vout]",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-preset", "medium",
    "-crf", "18",
    "-movflags", "+faststart",
    "-y", outPath,
  ];

  await new Promise<void>((resolve, reject) => {
    const p = spawn(ffmpeg, args, { stdio: ["ignore", "ignore", "pipe"] });
    const stderrChunks: Buffer[] = [];
    p.stderr.on("data", (c: Buffer) => stderrChunks.push(c));
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) return resolve();
      const tail = Buffer.concat(stderrChunks).toString("utf8").split("\n").slice(-12).join("\n");
      reject(new Error(`ffmpeg xfade-concat exited with code ${code}\n${tail}`));
    });
  });
}

function buildFfmpegArgs(o: EncodeOptions): string[] {
  const inputFmt = o.inputFormat ?? "png";
  const nativeFps = o.nativeFps ?? o.fps;
  const targetFps = o.fps;

  const base = [
    "-y",
    "-f", "image2pipe",
    "-framerate", String(nativeFps),
    "-i", "pipe:0",
  ];
  void inputFmt; // currently unused — stdin demuxer auto-detects PNG vs JPEG

  // Build the video filter chain. When `nativeFps < targetFps` we have two paths:
  //   1. (default) Cheap frame duplication via `fps=targetFps` filter — replicates
  //      the previous frame to fill in. Costs ~zero extra encode time and looks
  //      fine for slow scenes (tilt-in, float, fade-in, zoom-in) which are the
  //      common case in App Store/Play Store hero videos.
  //   2. (smoothMotion: true) `minterpolate` synthesizes new frames via motion
  //      estimation. ~5-10× more expensive at 1320×2868 but produces buttery
  //      motion for fast rotations / pans. Opt-in only.
  const needsUpsample = nativeFps < targetFps;
  const upsampleFilter = needsUpsample
    ? o.smoothMotion
      ? `minterpolate=fps=${targetFps}:mi_mode=mci:mc_mode=aobmc:scd=fdiff,`
      : `fps=${targetFps},`
    : "";
  const padFilter = "scale=trunc(iw/2)*2:trunc(ih/2)*2";
  const interpFilter = upsampleFilter; // back-compat alias for filter strings below

  switch (o.format) {
    case "mp4": {
      const codec = pickVideoCodec(o.videoCodec);
      // h264_videotoolbox uses bitrate (-b:v) or quality (-q:v), not -crf.
      const codecArgs =
        codec === "h264_videotoolbox"
          ? ["-c:v", "h264_videotoolbox", "-q:v", "55", "-allow_sw", "1"]
          : codec === "h264_nvenc"
            ? ["-c:v", "h264_nvenc", "-preset", "p4", "-cq", "20"]
            : ["-c:v", "libx264", "-preset", "medium", "-crf", "20"];
      return [
        ...base,
        "-vf", `${interpFilter}${padFilter}`,
        ...codecArgs,
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        o.outputPath,
      ];
    }

    case "webm":
      return [
        ...base,
        "-vf", `${interpFilter}${padFilter}`,
        "-c:v", "libvpx-vp9",
        "-b:v", "0",
        "-crf", "32",
        "-pix_fmt", "yuv420p",
        o.outputPath,
      ];

    case "gif":
      // High-quality GIF: build a palette inline via the split + palettegen + paletteuse filter chain.
      return [
        ...base,
        "-vf",
        `${interpFilter}fps=${targetFps},scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5`,
        "-loop", "0",
        o.outputPath,
      ];

    default: {
      const _exhaustive: never = o.format;
      void _exhaustive;
      throw new Error(`Unsupported format: ${(o as any).format}`);
    }
  }
}
