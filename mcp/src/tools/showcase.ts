import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";

export const ShowcaseInputSchema = z.object({
  screenshots: z
    .array(z.string().min(1))
    .min(1, "at least one screenshot path required")
    .max(10, "max 10 screenshots in a showcase"),
  output_path: z.string().min(1, "output_path is required"),
  caption: z.string().optional(),
  background: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#ffffff")
    .optional(),
  text_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#1a1a1a")
    .optional(),
  target_height: z.number().int().min(200).max(2000).default(800).optional(),
  padding: z.number().int().min(0).max(200).default(60).optional(),
  gap: z.number().int().min(0).max(200).default(40).optional(),
});

export type ShowcaseInput = z.infer<typeof ShowcaseInputSchema>;

export interface ShowcaseResult {
  path: string;
  width: number;
  height: number;
  count: number;
}

/**
 * Compose multiple finished App Store screenshots into a single side-by-side
 * preview image with an optional bottom caption (e.g. github.com/foo/bar).
 *
 * Mirrors the workflow in the aso-appstore-screenshots skill's showcase.py
 * but ships in-process so users don't need a separate Python toolchain.
 */
export async function makeShowcase(input: ShowcaseInput): Promise<ShowcaseResult> {
  const target_height = input.target_height ?? 800;
  const padding = input.padding ?? 60;
  const gap = input.gap ?? 40;
  const bg = input.background ?? "#ffffff";
  const textColor = input.text_color ?? "#1a1a1a";

  if (input.screenshots.length === 0) {
    throw new Error("screenshots is empty");
  }

  // Load + scale every screenshot to the target height while preserving aspect ratio.
  const scaled: Array<{ buf: Buffer; width: number; height: number }> = [];
  for (const p of input.screenshots) {
    const abs = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
    const meta = await sharp(abs).metadata();
    if (!meta.width || !meta.height) {
      throw new Error(`could not read dimensions of ${abs}`);
    }
    const ratio = target_height / meta.height;
    const targetW = Math.max(1, Math.round(meta.width * ratio));
    const buf = await sharp(abs)
      .resize(targetW, target_height, { fit: "fill" })
      .png()
      .toBuffer();
    scaled.push({ buf, width: targetW, height: target_height });
  }

  const captionBarH = input.caption ? 100 : 0;
  const totalW =
    scaled.reduce((acc, s) => acc + s.width, 0) +
    gap * (scaled.length - 1) +
    padding * 2;
  const totalH = target_height + padding * 2 + captionBarH;

  const composite: sharp.OverlayOptions[] = [];
  let cursorX = padding;
  for (const s of scaled) {
    composite.push({ input: s.buf, left: cursorX, top: padding });
    cursorX += s.width + gap;
  }

  // Caption — render via SVG so we don't need a font file on the host.
  if (input.caption) {
    const text = escapeXml(input.caption);
    const fontSize = clamp(
      Math.floor((totalW - padding * 2) / Math.max(text.length * 0.55, 8)),
      18,
      48
    );
    const captionY = padding + target_height + Math.floor(captionBarH / 2);
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}">
  <style>
    .caption {
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Inter, sans-serif;
      font-weight: 500;
      font-size: ${fontSize}px;
      fill: ${textColor};
    }
  </style>
  <text x="${totalW / 2}" y="${captionY}" text-anchor="middle" dominant-baseline="middle" class="caption">${text}</text>
</svg>`;
    composite.push({ input: Buffer.from(svg), left: 0, top: 0 });
  }

  const out = await sharp({
    create: {
      width: totalW,
      height: totalH,
      channels: 4,
      background: hexToRgba(bg),
    },
  })
    .composite(composite)
    .png()
    .toBuffer();

  const abs = path.isAbsolute(input.output_path)
    ? input.output_path
    : path.resolve(process.cwd(), input.output_path);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, out);

  return { path: abs, width: totalW, height: totalH, count: scaled.length };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function hexToRgba(hex: string): { r: number; g: number; b: number; alpha: number } {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return { r, g, b, alpha: 1 };
}
