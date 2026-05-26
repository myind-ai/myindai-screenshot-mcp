import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { listPresets, loadImage, render } from "../renderer/render.js";
import { MAX_IMAGE_BYTES } from "../config.js";

const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const GradientStop = z.object({
  color: HexColor,
  position: z.number().min(0).max(100),
});

const Background = z.object({
  type: z.enum(["gradient", "solid", "image"]).optional(),
  gradient: z
    .object({
      angle: z.number().min(0).max(360).optional(),
      stops: z.array(GradientStop).min(2).optional(),
    })
    .optional(),
  solid: HexColor.optional(),
  overlayColor: HexColor.optional(),
  overlayOpacity: z.number().min(0).max(100).optional(),
  blur: z.number().min(0).max(40).optional(),
  noise: z.boolean().optional(),
  noiseIntensity: z.number().min(0).max(100).optional(),
});

const Shadow = z.object({
  enabled: z.boolean().optional(),
  color: HexColor.optional(),
  blur: z.number().min(0).max(200).optional(),
  opacity: z.number().min(0).max(100).optional(),
  x: z.number().min(-200).max(200).optional(),
  y: z.number().min(-200).max(200).optional(),
});

const Frame = z.object({
  enabled: z.boolean().optional(),
  color: HexColor.optional(),
  width: z.number().min(0).max(80).optional(),
  opacity: z.number().min(0).max(100).optional(),
});

const Glow = z.object({
  enabled: z.boolean().optional(),
  color: HexColor.optional(),
  intensity: z.number().min(0).max(100).optional(),
  size: z.number().min(5).max(250).optional(),
});

const Decoration = z.object({
  type: z
    .enum(["none", "big-number", "big-word", "dotted-grid", "blobs", "accent-stripe"])
    .optional(),
  value: z.string().optional(),
  color: HexColor.optional(),
  opacity: z.number().min(0).max(100).optional(),
  position: z
    .enum(["top-left", "top-right", "bottom-left", "bottom-right", "center"])
    .optional(),
});

const Rotation3D = z.object({
  x: z.number().min(-180).max(180).optional(),
  y: z.number().min(-180).max(180).optional(),
  z: z.number().min(-180).max(180).optional(),
});

const Screenshot = z.object({
  scale: z.number().min(0).max(200).optional(),
  x: z.number().min(-50).max(150).optional(),
  y: z.number().min(-50).max(150).optional(),
  rotation: z.number().min(-180).max(180).optional(),
  perspective: z.number().min(0).max(45).optional(),
  cornerRadius: z.number().min(0).max(120).optional(),
  use3D: z.boolean().optional(),
  device3D: z.enum(["iphone", "samsung"]).optional(),
  rotation3D: Rotation3D.optional(),
  shadow: Shadow.optional(),
  frame: Frame.optional(),
  glow: Glow.optional(),
  decoration: Decoration.optional(),
});

const Text = z.object({
  headline: z.string().optional(),
  subheadline: z.string().optional(),
  position: z.enum(["top", "bottom"]).optional(),
  offsetY: z.number().min(-100).max(100).optional(),
  lineHeight: z.number().min(50).max(250).optional(),
  font: z.string().optional(),
  headlineFont: z.string().optional(),
  subheadlineFont: z.string().optional(),
  headlineSize: z.number().min(20).max(300).optional(),
  subheadlineSize: z.number().min(20).max(300).optional(),
  headlineWeight: z.string().optional(),
  subheadlineWeight: z.string().optional(),
  headlineItalic: z.boolean().optional(),
  headlineUnderline: z.boolean().optional(),
  headlineStrikethrough: z.boolean().optional(),
  subheadlineItalic: z.boolean().optional(),
  subheadlineUnderline: z.boolean().optional(),
  subheadlineStrikethrough: z.boolean().optional(),
  headlineColor: HexColor.optional(),
  subheadlineColor: HexColor.optional(),
  subheadlineOpacity: z.number().min(0).max(100).optional(),
  // Pro typography
  headlineTextAlign: z.enum(["left", "center", "right"]).optional(),
  headlineLetterSpacing: z.number().min(-10).max(30).optional(),
  headlineMaxWidthPct: z.number().min(30).max(100).optional(),
  headlineHighlightWord: z.string().optional(),
  headlineHighlightColor: HexColor.optional(),
  headlineHighlightStyle: z.enum(["color", "pill"]).optional(),
  headlineHighlightPillTextColor: HexColor.optional(),
  headlineGradient: z
    .object({
      colors: z.array(HexColor).min(2),
      angle: z.number().min(0).max(360).optional(),
    })
    .nullable()
    .optional(),
});

export const RenderInputSchema = z.object({
  image: z.string().min(1, "image (path, data URL, or base64) is required"),
  // Optional: a reference template image whose design language was cloned into this call.
  // Purely informational — the renderer ignores it; included in `decisions` for traceability.
  reference_image: z.string().optional(),
  // Quick high-level (still supported)
  headline: z.string().optional(),
  subheadline: z.string().optional(),
  mode: z.enum(["2d", "3d"]).optional(),
  position_preset: z
    .enum([
      "centered",
      "bleed-bottom",
      "bleed-top",
      "float-center",
      "tilt-left",
      "tilt-right",
      "perspective",
      "float-bottom",
    ])
    .optional(),
  background_preset: z.string().optional(),
  accent_color: HexColor.optional(),
  text_color: z.enum(["light", "dark"]).optional(),
  // Output
  language: z.string().default("en"),
  output_device: z
    .enum([
      "iphone-6.9",
      "iphone-6.7",
      "iphone-6.5",
      "iphone-5.5",
      "android-phone",
      "android-phone-hd",
      "android-tablet-7",
      "android-tablet-10",
    ])
    .optional(),
  output_path: z.string().optional(),
  // Detailed overrides
  background: Background.optional(),
  screenshot: Screenshot.optional(),
  text: Text.optional(),
});

export type RenderToolInput = z.infer<typeof RenderInputSchema>;

export async function renderScreenshot(input: RenderToolInput): Promise<{
  image_base64?: string;
  path?: string;
  decisions: Record<string, unknown>;
  warnings?: string[];
}> {
  const { dataUrl, buffer, name } = await loadImage(input.image);

  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(
      `image too large: ${buffer.byteLength} bytes (max ${MAX_IMAGE_BYTES})`
    );
  }

  // Coerce background preset name (case-insensitive). Renderer also coerces, but we
  // canonicalise here so the returned `decisions` reflects what we actually rendered.
  let bg = input.background_preset;
  if (bg) {
    const presets = await listPresets();
    const exact = presets.gradientPresets.find((p) => p.name === bg);
    if (!exact) {
      const ci = presets.gradientPresets.find(
        (p) => p.name.toLowerCase() === bg!.toLowerCase()
      );
      bg = ci ? ci.name : presets.gradientPresets[0]?.name;
    }
  }

  // Issue #2 fix: only include optional fields when defined — `undefined`
  // values silently overrode template defaults on the frontend's spread merge.
  const decision: Record<string, unknown> = {
    headline: input.headline ?? "",
    subheadline: input.subheadline ?? "",
    mode: input.mode ?? "2d",
    accentColor: input.accent_color ?? "#667eea",
    textColor: input.text_color ?? "light",
    reasoning: "client-supplied",
  };
  if (input.position_preset !== undefined) decision.positionPreset = input.position_preset;
  if (bg !== undefined) decision.backgroundPreset = bg;
  if (input.background !== undefined) decision.background = input.background;
  if (input.screenshot !== undefined) decision.screenshot = input.screenshot;
  if (input.text !== undefined) decision.text = input.text;
  if (input.reference_image !== undefined) decision.reference_image = input.reference_image;

  const png = await render({
    dataUrl,
    name,
    language: input.language,
    outputDevice: input.output_device,
    decision,
  });

  // Issue #3 fix: surface a clear "3D not yet implemented" warning instead of
  // silently rendering a 2D fallback. Real 3D ships when .glb device frames
  // land in a later rc.
  const warnings: string[] = [];
  if (input.mode === "3d") {
    warnings.push(
      "3D mode requested but the renderer ships a 2D placeholder in this release. " +
        "The output above is a 2D rounded-rectangle device shell. Real WebGL device " +
        "frames (use3D / device3D / rotation3D) ship when .glb device models land — " +
        "see ASSETS.md."
    );
  }

  if (input.output_path) {
    const abs = path.isAbsolute(input.output_path)
      ? input.output_path
      : path.resolve(process.cwd(), input.output_path);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, png);
    return warnings.length
      ? { path: abs, decisions: decision, warnings }
      : { path: abs, decisions: decision };
  }

  return warnings.length
    ? { image_base64: png.toString("base64"), decisions: decision, warnings }
    : { image_base64: png.toString("base64"), decisions: decision };
}
