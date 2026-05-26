import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { analyze } from "../ai/analyze.js";
import { listPresets, loadImage, render } from "../renderer/render.js";
import { MAX_IMAGE_BYTES } from "../config.js";
import type { AIDecision, GenerateInput, GenerateOutput } from "../types.js";

export const GenerateInputSchema = z.object({
  image: z.string().min(1, "image (path, data URL, or base64) is required"),
  app_name: z.string().optional(),
  language: z.string().optional().default("en"),
  device: z.enum(["auto", "iphone-2d", "iphone-3d"]).optional().default("auto"),
  hints: z.string().optional(),
  output_path: z.string().optional(),
});

export async function generateScreenshot(
  input: GenerateInput
): Promise<GenerateOutput> {
  const { dataUrl, buffer, name } = await loadImage(input.image);

  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(
      `image too large: ${buffer.byteLength} bytes (max ${MAX_IMAGE_BYTES})`
    );
  }

  const presets = await listPresets();

  const mime = sniffMime(buffer) || "image/png";

  let decision: AIDecision = await analyze({
    imageBuffer: buffer,
    imageMime: mime,
    appName: input.app_name,
    hints: input.hints,
    language: input.language,
    fileName: name,
    positionPresets: presets.positionPresets,
    gradientPresets: presets.gradientPresets,
  });

  // Honor explicit device override.
  if (input.device === "iphone-2d") decision = { ...decision, mode: "2d" };
  else if (input.device === "iphone-3d") decision = { ...decision, mode: "3d" };

  // Issue #8 fix: surface a clear warning when the user gave us hints / AI
  // intent but no AI was actually available. Previously buried as a
  // `reasoning: "deterministic fallback..."` string the user almost never read.
  const warnings: string[] = [];
  const usedFallback =
    typeof (decision as { reasoning?: string }).reasoning === "string" &&
    /deterministic|fallback|unavailable/i.test((decision as { reasoning?: string }).reasoning || "");
  if (usedFallback && !process.env.ANTHROPIC_API_KEY) {
    warnings.push(
      "AI layer is disabled — `ANTHROPIC_API_KEY` is not set and the MCP client " +
        "did not advertise sampling capability. Your `hints` and `app_name` were " +
        "ignored; the output uses deterministic defaults. Set `ANTHROPIC_API_KEY` " +
        "in the server env, or use a sampling-capable MCP client (Claude Desktop, " +
        "Claude Code, Cursor, Windsurf, Cline) and AI features turn on automatically. " +
        "See docs/llm-strategy.md."
    );
  }
  if (input.device === "iphone-3d" || decision.mode === "3d") {
    warnings.push(
      "3D mode requested but the renderer ships a 2D placeholder in this release. " +
        "The output above is a 2D rounded-rectangle device shell. Real WebGL device " +
        "frames (use3D / device3D / rotation3D) ship when .glb device models land."
    );
  }

  const png = await render({
    dataUrl,
    name,
    language: input.language || "en",
    decision,
  });

  if (input.output_path) {
    const abs = path.isAbsolute(input.output_path)
      ? input.output_path
      : path.resolve(process.cwd(), input.output_path);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, png);
    return warnings.length
      ? ({ path: abs, decisions: decision, warnings } as GenerateOutput)
      : { path: abs, decisions: decision };
  }

  return warnings.length
    ? ({ image_base64: png.toString("base64"), decisions: decision, warnings } as GenerateOutput)
    : { image_base64: png.toString("base64"), decisions: decision };
}

function sniffMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  // GIF
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
  // WEBP: RIFF .... WEBP
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return "image/webp";
  return null;
}
