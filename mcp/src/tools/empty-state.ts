import path from "node:path";
import fs from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { ANTHROPIC_API_KEY, ANTHROPIC_MODEL, MAX_IMAGE_BYTES } from "../config.js";

// Empty-state detector. Vision-classifies a simulator screenshot BEFORE pairing
// it with a verb so the ASO pipeline doesn't waste a render slot on a login,
// onboarding, paywall, or empty-list page. Returns a verdict and per-screenshot
// reasoning so callers can show users why a screenshot was rejected.

export const DetectEmptyStateInputSchema = z.object({
  image: z
    .union([z.string(), z.array(z.string()).min(1)])
    .describe("One simulator screenshot path or an array."),
  // Strictness: a stricter detector rejects more aggressively. Default 'normal'
  // matches the heuristics tested on Kaabil's release.
  strictness: z.enum(["lax", "normal", "strict"]).default("normal").optional(),
});

export type DetectEmptyStateInput = z.infer<typeof DetectEmptyStateInputSchema>;

export type EmptyStateVerdict =
  | "ok"
  | "login"
  | "onboarding"
  | "paywall"
  | "empty-list"
  | "loading"
  | "error"
  | "permission-prompt"
  | "splash";

export interface ScreenVerdict {
  image: string;
  verdict: EmptyStateVerdict;
  reasoning: string;
  recommendation: string;
}

export interface DetectEmptyStateResult {
  count: number;
  verdicts: ScreenVerdict[];
  rejected: ScreenVerdict[];
  ok: ScreenVerdict[];
  // True when EVERY screenshot is OK — caller can fast-path.
  all_clear: boolean;
}

const SYSTEM_PROMPT = `You are an App Store ASO art-director assistant. You inspect simulator screenshots and classify whether each one is appropriate to use as a hero/benefit screenshot in App Store / Play Store marketing.

Reject screens that show:
- login / signup / OTP entry (verdict: "login")
- onboarding / tutorial / paywall slides where the actual app UI is hidden (verdict: "onboarding")
- paywall / subscription upsell (verdict: "paywall")
- empty list / "no items yet" / first-run blank page (verdict: "empty-list")
- spinner / loading state (verdict: "loading")
- error page / crash / network error (verdict: "error")
- permission prompts (notifications, camera, location) (verdict: "permission-prompt")
- splash / launch logo (verdict: "splash")

Accept screens that show real app content (lists with items, dashboards, content detail, settings with values filled in). Use verdict "ok".

Return ONLY valid JSON of shape:
{ "verdict": "ok"|"login"|..., "reasoning": "<short, 1-2 sentence>", "recommendation": "<what to show instead, or empty if ok>" }
No markdown, no prose outside the JSON.`;

export async function detectEmptyState(
  input: DetectEmptyStateInput
): Promise<DetectEmptyStateResult> {
  const images = Array.isArray(input.image) ? input.image : [input.image];
  const strictness = input.strictness ?? "normal";

  const verdicts: ScreenVerdict[] = [];
  for (const img of images) {
    const v = await classifyOne(img, strictness);
    verdicts.push(v);
  }

  const rejected = verdicts.filter((v) => v.verdict !== "ok");
  const ok = verdicts.filter((v) => v.verdict === "ok");

  return {
    count: verdicts.length,
    verdicts,
    rejected,
    ok,
    all_clear: rejected.length === 0,
  };
}

async function classifyOne(image: string, strictness: string): Promise<ScreenVerdict> {
  const { buffer, mime } = await loadImageForVision(image);
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`image too large: ${buffer.byteLength} bytes (max ${MAX_IMAGE_BYTES})`);
  }

  if (!ANTHROPIC_API_KEY) {
    return {
      image,
      verdict: "ok",
      reasoning: "ANTHROPIC_API_KEY not set — skipped vision classification (default ok).",
      recommendation: "",
    };
  }

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const userText =
    strictness === "strict"
      ? "Be strict — when in doubt, reject. Classify this screenshot."
      : strictness === "lax"
        ? "Be lenient — only reject obvious blockers. Classify this screenshot."
        : "Classify this screenshot using the rules above.";

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await client.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 400,
        system: [
          { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        ] as any,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mime as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
                  data: buffer.toString("base64"),
                },
              },
              { type: "text", text: userText },
            ],
          },
        ],
      });
      const text = (resp.content.find((c: any) => c.type === "text") as any)?.text;
      const parsed = parseJson(text);
      if (parsed && typeof parsed.verdict === "string") {
        return {
          image,
          verdict: normalizeVerdict(parsed.verdict),
          reasoning: String(parsed.reasoning ?? ""),
          recommendation: String(parsed.recommendation ?? ""),
        };
      }
    } catch (err: any) {
      process.stderr.write(`[detect_empty_state] attempt ${attempt} error: ${err?.message || err}\n`);
    }
  }

  return {
    image,
    verdict: "ok",
    reasoning: "vision classification failed twice — falling back to 'ok'",
    recommendation: "",
  };
}

function normalizeVerdict(v: string): EmptyStateVerdict {
  const lower = v.toLowerCase().trim();
  const allowed: EmptyStateVerdict[] = [
    "ok",
    "login",
    "onboarding",
    "paywall",
    "empty-list",
    "loading",
    "error",
    "permission-prompt",
    "splash",
  ];
  return (allowed.includes(lower as EmptyStateVerdict) ? lower : "ok") as EmptyStateVerdict;
}

function parseJson(text?: string): any | null {
  if (!text) return null;
  let s = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(s);
  } catch {}
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(s.slice(start, end + 1));
    } catch {}
  }
  return null;
}

async function loadImageForVision(image: string): Promise<{ buffer: Buffer; mime: string }> {
  if (image.startsWith("data:")) {
    const m = image.match(/^data:([a-z0-9.+/-]+);base64,(.+)$/i);
    if (!m) throw new Error("invalid data URL");
    return { buffer: Buffer.from(m[2], "base64"), mime: m[1] };
  }
  if (!image.includes("/") && !image.includes("\\") && /^[A-Za-z0-9+/=\r\n]+$/.test(image) && image.length > 200) {
    return { buffer: Buffer.from(image, "base64"), mime: "image/png" };
  }
  const abs = path.isAbsolute(image) ? image : path.resolve(process.cwd(), image);
  const buffer = await fs.readFile(abs);
  const ext = path.extname(abs).toLowerCase().replace(".", "") || "png";
  const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
  return { buffer, mime };
}
