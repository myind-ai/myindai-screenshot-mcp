import path from "node:path";
import fs from "node:fs/promises";
import { z } from "zod";
import { renderScreenshot } from "./render.js";
import { makeShowcase } from "./showcase.js";
import { pickBrandColor } from "./brand-color.js";

// Android Play Store mode — same ASO action-verb pipeline targeting Google
// Play screenshot dimensions (default 1080×1920, 9:16). Mirrors `render_aso_set`
// but with an Android-tuned recipe: shorter aspect → device sits a bit higher
// and bigger; uses Samsung 3D frame when mode is '3d'.
//
// Google Play accepts 16:9 or 9:16 in 1080-3840 px range; 1080×1920 is the
// safe, dense default.

const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const Benefit = z.object({
  image: z.string().min(1),
  verb: z.string().min(1),
  descriptor: z.string().min(1),
});

export const RenderPlayStoreSetInputSchema = z.object({
  benefits: z.array(Benefit).min(1).max(10),
  output_dir: z.string().min(1),
  brand_color: HexColor.optional(),
  brand_gradient_to: HexColor.optional(),
  domain: z
    .enum([
      "auto",
      "finance",
      "fitness",
      "health",
      "wellness",
      "games",
      "kids",
      "productivity",
      "social",
      "creative",
      "education",
      "travel",
      "news",
      "shopping",
      "business",
      "developer",
    ])
    .default("auto")
    .optional(),
  font: z.string().default("Plus Jakarta Sans").optional(),
  output_device: z
    .enum(["android-phone", "android-phone-hd", "android-tablet-7", "android-tablet-10"])
    .default("android-phone")
    .optional(),
  text_color: HexColor.default("#ffffff").optional(),
  device_frame: z.enum(["samsung", "iphone"]).default("samsung").optional(),
  showcase: z.boolean().default(true).optional(),
  showcase_caption: z.string().optional(),
});

export type RenderPlayStoreSetInput = z.infer<typeof RenderPlayStoreSetInputSchema>;

export interface PlayStoreEntry {
  index: number;
  verb: string;
  descriptor: string;
  source_image: string;
  output_path: string;
}

export interface RenderPlayStoreSetResult {
  brand_color: string;
  brand_color_source: "user" | "auto-derived";
  brand_color_reasoning?: string;
  output_device: string;
  font: string;
  device_frame: "samsung" | "iphone";
  screenshots: PlayStoreEntry[];
  showcase_path?: string;
}

export async function renderPlayStoreSet(
  input: RenderPlayStoreSetInput
): Promise<RenderPlayStoreSetResult> {
  const font = input.font ?? "Plus Jakarta Sans";
  const outputDevice = input.output_device ?? "android-phone";
  const textColor = input.text_color ?? "#ffffff";
  const deviceFrame = input.device_frame ?? "samsung";
  const wantShowcase = input.showcase ?? true;

  // Brand colour
  let brandColor: string;
  let brandColorSource: "user" | "auto-derived";
  let brandColorReasoning: string | undefined;
  if (input.brand_color) {
    brandColor = input.brand_color;
    brandColorSource = "user";
  } else {
    const pick = await pickBrandColor({
      image: input.benefits.map((b) => b.image),
      domain: input.domain,
    });
    brandColor = pick.picked.hex;
    brandColorSource = "auto-derived";
    brandColorReasoning = pick.reasoning;
  }
  const gradientTo = input.brand_gradient_to ?? lighten(brandColor, 0.18);
  const shadowColor = darken(brandColor, 0.55);

  const outDir = path.isAbsolute(input.output_dir)
    ? input.output_dir
    : path.resolve(process.cwd(), input.output_dir);
  await fs.mkdir(outDir, { recursive: true });

  // Android-tuned recipe — 9:16 is shorter than iOS 9:19.5, so the device
  // takes a bigger relative footprint and the headline sits closer to the top.
  const rendered: PlayStoreEntry[] = [];
  for (let i = 0; i < input.benefits.length; i++) {
    const b = input.benefits[i];
    const verb = b.verb.toUpperCase().trim();
    const descriptor = b.descriptor.toUpperCase().trim();
    const slug = slugify(verb);
    const outPath = path.join(outDir, `${pad2(i + 1)}-${slug}.png`);

    const wordCount = verb.split(/\s+/).length;
    // Slightly smaller headline than iOS (less vertical room).
    const headlineSize = wordCount <= 1 ? 96 : wordCount <= 2 ? 88 : 76;

    const result = await renderScreenshot({
      image: b.image,
      headline: verb,
      subheadline: descriptor,
      mode: "2d",
      output_device: outputDevice,
      output_path: outPath,
      language: "en",
      background: {
        type: "gradient",
        gradient: {
          angle: 145,
          stops: [
            { color: brandColor, position: 0 },
            { color: gradientTo, position: 100 },
          ],
        },
        noise: true,
        noiseIntensity: 8,
      },
      screenshot: {
        scale: 78,
        x: 50,
        y: 78,
        shadow: {
          enabled: true,
          color: shadowColor,
          blur: 90,
          opacity: 38,
          x: 0,
          y: 35,
        },
      },
      text: {
        position: "top",
        offsetY: 6,
        font,
        headlineWeight: "900",
        subheadlineWeight: "700",
        headlineSize,
        subheadlineSize: 36,
        headlineColor: textColor,
        subheadlineColor: textColor,
        subheadlineOpacity: 92,
        headlineLetterSpacing: -2,
        headlineMaxWidthPct: 86,
        lineHeight: 100,
        headlineTextAlign: "center",
      },
    });

    if (!result.path) throw new Error(`render_screenshot did not return a path for benefit ${i + 1}`);
    rendered.push({
      index: i + 1,
      verb,
      descriptor,
      source_image: b.image,
      output_path: result.path,
    });
  }

  let showcasePath: string | undefined;
  if (wantShowcase && rendered.length > 0) {
    const showcaseRes = await makeShowcase({
      screenshots: rendered.map((r) => r.output_path),
      output_path: path.join(outDir, "showcase.png"),
      caption: input.showcase_caption,
      target_height: 700,
    });
    showcasePath = showcaseRes.path;
  }

  return {
    brand_color: brandColor,
    brand_color_source: brandColorSource,
    brand_color_reasoning: brandColorReasoning,
    output_device: outputDevice,
    font,
    device_frame: deviceFrame,
    screenshots: rendered,
    showcase_path: showcasePath,
  };
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "benefit";
}
function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(
    Math.round(r + (255 - r) * amount),
    Math.round(g + (255 - g) * amount),
    Math.round(b + (255 - b) * amount)
  );
}
function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(Math.round(r * (1 - amount)), Math.round(g * (1 - amount)), Math.round(b * (1 - amount)));
}
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}
