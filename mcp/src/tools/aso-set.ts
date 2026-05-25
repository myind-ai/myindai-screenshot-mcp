import path from "node:path";
import fs from "node:fs/promises";
import { z } from "zod";
import { renderScreenshot } from "./render.js";
import { makeShowcase } from "./showcase.js";
import { pickBrandColor } from "./brand-color.js";

const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const Benefit = z.object({
  image: z.string().min(1, "image path required"),
  verb: z.string().min(1, "ACTION VERB required (e.g. 'TRACK')"),
  descriptor: z.string().min(1, "descriptor required (e.g. 'TRADING CARD PRICES')"),
});

export const RenderAsoSetInputSchema = z.object({
  benefits: z
    .array(Benefit)
    .min(1, "at least one (image, verb, descriptor) entry required")
    .max(10, "max 10 screenshots in a set"),
  output_dir: z.string().min(1, "output_dir required (e.g. './screenshots/final')"),
  // Brand colour. If omitted, auto-derived from the FIRST screenshot via pick_brand_color.
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
  // Style overrides (rarely needed — locked-in recipe is the point).
  font: z.string().default("Plus Jakarta Sans").optional(),
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
    .default("iphone-6.9")
    .optional(),
  text_color: HexColor.default("#ffffff").optional(),
  // Whether to also produce a side-by-side showcase.png at the end.
  showcase: z.boolean().default(true).optional(),
  showcase_caption: z.string().optional(),
});

export type RenderAsoSetInput = z.infer<typeof RenderAsoSetInputSchema>;

export interface RenderedAsoEntry {
  index: number;
  verb: string;
  descriptor: string;
  source_image: string;
  output_path: string;
}

export interface RenderAsoSetResult {
  brand_color: string;
  brand_color_source: "user" | "auto-derived";
  brand_color_reasoning?: string;
  output_device: string;
  font: string;
  screenshots: RenderedAsoEntry[];
  showcase_path?: string;
}

/**
 * One-shot ASO action-verb set renderer. Bundles the entire battle-tested
 * recipe so a caller only has to supply { image, verb, descriptor } per
 * benefit — the locked-in scale/y/offsetY/sizes are applied automatically
 * and identically across every screenshot for set-wide consistency.
 *
 * Auto-derives the brand colour via pick_brand_color (with stricter filters
 * than raw extract_palette) when brand_color isn't passed.
 */
export async function renderAsoSet(input: RenderAsoSetInput): Promise<RenderAsoSetResult> {
  const font = input.font ?? "Plus Jakarta Sans";
  const outputDevice = input.output_device ?? "iphone-6.9";
  const textColor = input.text_color ?? "#ffffff";
  const wantShowcase = input.showcase ?? true;

  // 1. Resolve brand colour.
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

  // 2. Resolve output_dir.
  const outDir = path.isAbsolute(input.output_dir)
    ? input.output_dir
    : path.resolve(process.cwd(), input.output_dir);
  await fs.mkdir(outDir, { recursive: true });

  // 3. Render each benefit with the locked-in recipe.
  const rendered: RenderedAsoEntry[] = [];
  for (let i = 0; i < input.benefits.length; i++) {
    const b = input.benefits[i];
    const verb = b.verb.toUpperCase().trim();
    const descriptor = b.descriptor.toUpperCase().trim();
    const slug = slugify(verb);
    const outPath = path.join(outDir, `${pad2(i + 1)}-${slug}.png`);

    const wordCount = verb.split(/\s+/).length;
    const headlineSize = wordCount <= 1 ? 110 : wordCount <= 2 ? 100 : 88;

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
        scale: 73,
        x: 50,
        y: 80,
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
        offsetY: 8,
        font,
        headlineWeight: "900",
        subheadlineWeight: "700",
        headlineSize,
        subheadlineSize: 40,
        headlineColor: textColor,
        subheadlineColor: textColor,
        subheadlineOpacity: 92,
        headlineLetterSpacing: -2,
        headlineMaxWidthPct: 82,
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

  // 4. Optionally make showcase.
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
    screenshots: rendered,
    showcase_path: showcasePath,
  };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "benefit";
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return rgbToHex(lr, lg, lb);
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
