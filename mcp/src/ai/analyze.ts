import Anthropic from "@anthropic-ai/sdk";
import { ANTHROPIC_API_KEY, ANTHROPIC_MODEL } from "../config.js";
import { AIDecisionSchema, FALLBACK_DECISION, type AIDecision } from "../types.js";
import { buildSystemPrompt, deterministicDecision, type PromptContext } from "./prompts.js";

export interface AnalyzeInput {
  imageBuffer: Buffer;
  imageMime: string;
  appName?: string;
  hints?: string;
  language?: string;
  fileName?: string;
  positionPresets: string[];
  gradientPresets: { name: string }[];
}

export async function analyze(input: AnalyzeInput): Promise<AIDecision> {
  const ctx: PromptContext = {
    appName: input.appName,
    hints: input.hints,
    language: input.language,
    positionPresets: input.positionPresets,
    gradientPresets: input.gradientPresets,
  };

  if (!ANTHROPIC_API_KEY) {
    return deterministicDecision(ctx, input.fileName);
  }

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const sysPrompt = buildSystemPrompt(ctx);
  const imageBase64 = input.imageBuffer.toString("base64");

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await client.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 800,
        system: sysPrompt,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: (input.imageMime || "image/png") as
                    | "image/png"
                    | "image/jpeg"
                    | "image/gif"
                    | "image/webp",
                  data: imageBase64,
                },
              },
              {
                type: "text",
                text:
                  attempt === 0
                    ? "Analyze this screenshot and return the JSON decision."
                    : "Your previous response wasn't valid JSON. Return ONLY the JSON object — no markdown, no prose.",
              },
            ],
          },
        ],
      });

      const textBlock = resp.content.find((b) => b.type === "text") as
        | { type: "text"; text: string }
        | undefined;
      if (!textBlock) continue;

      const parsed = parseJson(textBlock.text);
      if (!parsed) continue;

      // Validate against schema; fix preset names if invalid.
      const fixed = coerceDecision(parsed, input.gradientPresets);
      const validated = AIDecisionSchema.safeParse(fixed);
      if (validated.success) return validated.data;
    } catch (err: any) {
      process.stderr.write(`[analyze] attempt ${attempt} error: ${err?.message || err}\n`);
    }
  }

  const fb = { ...FALLBACK_DECISION };
  fb.headline = deterministicDecision(ctx, input.fileName).headline;
  fb.backgroundPreset = ctx.gradientPresets[0]?.name || fb.backgroundPreset;
  fb.reasoning = "fallback (AI returned invalid response twice)";
  return fb;
}

function parseJson(text: string): any | null {
  // Strip code fences if present.
  let s = text.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(s);
  } catch {
    // Try to extract first { ... } block.
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(s.slice(start, end + 1));
      } catch {}
    }
    return null;
  }
}

function coerceDecision(
  raw: any,
  gradientPresets: { name: string }[]
): any {
  const out = { ...raw };
  // Fix backgroundPreset case-insensitively.
  if (typeof out.backgroundPreset === "string") {
    const match = gradientPresets.find(
      (p) => p.name.toLowerCase() === out.backgroundPreset.toLowerCase()
    );
    if (match) out.backgroundPreset = match.name;
    else out.backgroundPreset = gradientPresets[0]?.name || "Indigo Rush";
  } else {
    out.backgroundPreset = gradientPresets[0]?.name || "Indigo Rush";
  }
  if (out.subheadline == null) out.subheadline = "";
  if (out.reasoning == null) out.reasoning = "";
  if (!out.accentColor || !/^#[0-9a-fA-F]{6}$/.test(out.accentColor)) {
    out.accentColor = "#667eea";
  }
  if (out.textColor !== "light" && out.textColor !== "dark") out.textColor = "light";
  return out;
}
