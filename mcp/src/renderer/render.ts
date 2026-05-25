import fs from "node:fs/promises";
import path from "node:path";
import { withPage } from "./browser.js";
import type { AIDecision } from "../types.js";

export interface RenderInput {
  dataUrl: string;
  name?: string;
  language?: string;
  outputDevice?: string;
  // Allow either the legacy AIDecision or a richer freeform spec passed by render_screenshot.
  decision: AIDecision | Record<string, unknown>;
}

export async function render(input: RenderInput): Promise<Buffer> {
  return withPage(async (page) => {
    await page.evaluate(async (spec) => {
      const mcp = (window as any).__mcp;
      await mcp.ready;
      await mcp.applySpec(spec);
    }, input as any);

    const base64 = await page.evaluate(() => {
      return (window as any).__mcp.exportCanvasAsPng() as string;
    });

    return Buffer.from(base64, "base64");
  });
}

export interface PresetCatalog {
  contractVersion: number;
  positionPresets: string[];
  positionPresetDetails: Record<
    string,
    { scale: number; x: number; y: number; rotation: number; perspective: number }
  >;
  gradientPresets: { name: string; gradient: string }[];
  modes: string[];
  textPositions: string[];
  fontFamilies: string[];
  fontWeights: string[];
  backgroundTypes: string[];
  imageFits: string[];
  outputDevices: string[];
  canvasDimensions: Record<string, { width: number; height: number }>;
}

export async function listPresets(): Promise<PresetCatalog> {
  return withPage(async (page) => {
    return page.evaluate(() => (window as any).__mcp.listPresets()) as Promise<PresetCatalog>;
  });
}

// Resolve `image` input (path | data URL | base64) to a data URL string and a buffer.
export async function loadImage(image: string): Promise<{ dataUrl: string; buffer: Buffer; name: string }> {
  if (image.startsWith("data:")) {
    const match = image.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
    if (!match) throw new Error("invalid data URL");
    const buffer = Buffer.from(match[2], "base64");
    return { dataUrl: image, buffer, name: "input.png" };
  }

  // Could be a raw base64 string or a file path.
  if (!image.includes("/") && !image.includes("\\") && /^[A-Za-z0-9+/=\r\n]+$/.test(image) && image.length > 200) {
    const buffer = Buffer.from(image, "base64");
    const dataUrl = `data:image/png;base64,${image}`;
    return { dataUrl, buffer, name: "input.png" };
  }

  const abs = path.isAbsolute(image) ? image : path.resolve(process.cwd(), image);
  const buffer = await fs.readFile(abs);
  const ext = path.extname(abs).toLowerCase().replace(".", "") || "png";
  const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
  const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;
  return { dataUrl, buffer, name: path.basename(abs) };
}
