import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { MAX_IMAGE_BYTES } from "../config.js";

export const PaletteInputSchema = z.object({
  image: z.string().min(1, "image (path, data URL, or base64) is required"),
  count: z.number().int().min(1).max(10).default(5),
});

export type PaletteInput = z.infer<typeof PaletteInputSchema>;

export interface PaletteResult {
  // Top N dominant colors with their share of total pixels (0..1).
  colors: Array<{ hex: string; rgb: [number, number, number]; share: number }>;
  // A 3-stop gradient suggestion derived from the top dominant colors.
  suggested_gradient: { angle: number; stops: Array<{ color: string; position: number }> };
}

const SAMPLE_DIM = 96; // we downsample to ~96px on the longer edge — fast and accurate enough.

export async function extractPalette(input: PaletteInput): Promise<PaletteResult> {
  const buf = await loadBuffer(input.image);
  if (buf.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`image too large: ${buf.byteLength} bytes (max ${MAX_IMAGE_BYTES})`);
  }

  // Resize to a small thumbnail and read raw RGBA. sharp handles PNG, JPEG, WebP, etc.
  const meta = await sharp(buf).metadata();
  const longest = Math.max(meta.width || SAMPLE_DIM, meta.height || SAMPLE_DIM);
  const targetW = Math.round(((meta.width || SAMPLE_DIM) / longest) * SAMPLE_DIM);
  const targetH = Math.round(((meta.height || SAMPLE_DIM) / longest) * SAMPLE_DIM);

  const { data: raw, info } = await sharp(buf)
    .resize(Math.max(8, targetW), Math.max(8, targetH), { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Bucket pixels into a 32-bins-per-channel cube (5+5+5 = 15-bit color), keep counts.
  // This is a simple but accurate dominant-color sampler. Skip near-transparent and very
  // grey/dark pixels to avoid noise from edges.
  const buckets = new Map<number, { count: number; sumR: number; sumG: number; sumB: number }>();
  const W = info.width;
  const H = info.height;
  const totalPixels = W * H;

  for (let i = 0; i < raw.length; i += 4) {
    const r = raw[i];
    const g = raw[i + 1];
    const b = raw[i + 2];
    const a = raw[i + 3];
    if (a < 128) continue;

    // Quantize to 5 bits per channel.
    const qr = r >> 3, qg = g >> 3, qb = b >> 3;
    const key = (qr << 10) | (qg << 5) | qb;
    let entry = buckets.get(key);
    if (!entry) {
      entry = { count: 0, sumR: 0, sumG: 0, sumB: 0 };
      buckets.set(key, entry);
    }
    entry.count++;
    entry.sumR += r;
    entry.sumG += g;
    entry.sumB += b;
  }

  const ranked = Array.from(buckets.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, input.count * 4); // grab extras to dedupe similar buckets

  // Merge buckets that are visually similar (Lab-ish distance via crude RGB Euclidean).
  const merged: Array<{ r: number; g: number; b: number; count: number }> = [];
  for (const c of ranked) {
    const r = Math.round(c.sumR / c.count);
    const g = Math.round(c.sumG / c.count);
    const b = Math.round(c.sumB / c.count);
    const found = merged.find(
      (m) => Math.hypot(m.r - r, m.g - g, m.b - b) < 18
    );
    if (found) {
      const total = found.count + c.count;
      found.r = Math.round((found.r * found.count + r * c.count) / total);
      found.g = Math.round((found.g * found.count + g * c.count) / total);
      found.b = Math.round((found.b * found.count + b * c.count) / total);
      found.count = total;
    } else {
      merged.push({ r, g, b, count: c.count });
    }
  }

  merged.sort((a, b) => b.count - a.count);
  const top = merged.slice(0, input.count);

  const colors = top.map((c) => ({
    hex: rgbToHex(c.r, c.g, c.b),
    rgb: [c.r, c.g, c.b] as [number, number, number],
    share: c.count / totalPixels,
  }));

  // Build a sensible 3-stop gradient: order top colors by luminance (dark → light) by default.
  const sorted = [...top].sort((a, b) => luminance(a) - luminance(b));
  const pickStops = sorted.length >= 3
    ? [sorted[0], sorted[Math.floor(sorted.length / 2)], sorted[sorted.length - 1]]
    : sorted.length === 2
      ? [sorted[0], sorted[1]]
      : [sorted[0], sorted[0]];

  const suggested_gradient = {
    angle: 145,
    stops: pickStops.map((c, i) => ({
      color: rgbToHex(c.r, c.g, c.b),
      position: pickStops.length === 1 ? i * 100 : Math.round((i / (pickStops.length - 1)) * 100),
    })),
  };

  return { colors, suggested_gradient };
}

async function loadBuffer(image: string): Promise<Buffer> {
  if (image.startsWith("data:")) {
    const m = image.match(/^data:([a-z0-9.+/-]+);base64,(.+)$/i);
    if (!m) throw new Error("invalid data URL");
    return Buffer.from(m[2], "base64");
  }
  if (!image.includes("/") && !image.includes("\\") && /^[A-Za-z0-9+/=\r\n]+$/.test(image) && image.length > 200) {
    return Buffer.from(image, "base64");
  }
  const abs = path.isAbsolute(image) ? image : path.resolve(process.cwd(), image);
  return await fs.readFile(abs);
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function luminance(c: { r: number; g: number; b: number }): number {
  // Rec. 709 luminance — accurate enough for ordering colors light↔dark.
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}
