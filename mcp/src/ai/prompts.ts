import type { AIDecision } from "../types.js";

export interface PromptContext {
  appName?: string;
  hints?: string;
  language?: string;
  positionPresets: string[];
  gradientPresets: { name: string }[];
}

export function buildSystemPrompt(ctx: PromptContext): string {
  const positionList = ctx.positionPresets.map((p) => `  - ${p}`).join("\n");
  const gradientList = ctx.gradientPresets
    .map((p) => `  - ${p.name}`)
    .join("\n");

  return `You are an App Store marketing designer. You will be shown a single raw app screenshot.
Your job: choose how to compose a polished App Store marketing screenshot from it, and write the headline copy.

Output STRICT JSON matching this TypeScript shape (no prose, no markdown fences):

{
  "headline": string,           // 2-7 words, punchy, benefit-driven, no period at end
  "subheadline": string,        // 0-12 words, supporting line, can be empty string
  "mode": "2d" | "3d",          // "3d" only when the screenshot would benefit from depth (rare; default "2d")
  "positionPreset": one of the names listed below,
  "backgroundPreset": one of the gradient names listed below,
  "accentColor": "#rrggbb",     // hex color matching the screenshot's primary tone
  "textColor": "light" | "dark",// pick light for dark gradients, dark for light gradients
  "reasoning": string           // 1 short sentence: why these choices
}

Guidelines:
- Read what the screenshot shows. Headline must reflect the actual content, not generic filler.
- Match the gradient mood to the app's vibe (dark/serious → cool dark gradients; energetic → vibrant; calm → light pastels).
- Subheadline is optional. Leave it empty if the headline alone is stronger.
- Default mode is "2d". Only choose "3d" when the screenshot is a hero "wow" moment that deserves a premium device frame.
- ${ctx.appName ? `App context: ${ctx.appName}` : "No app name was provided — infer from the screenshot."}
${ctx.hints ? `- User hints: ${ctx.hints}` : ""}
${ctx.language ? `- Target language: ${ctx.language}. Write headline and subheadline in this language.` : ""}

Available position presets:
${positionList}

Available background gradient presets (use the exact name):
${gradientList}

Return ONLY the JSON object. No other text.`;
}

export function fallbackHeadlineFromName(appName?: string, fileName?: string): string {
  if (appName) return appName;
  if (fileName) {
    const cleaned = fileName
      .replace(/\.[^.]+$/, "")
      .replace(/^[\d._-]+/, "")
      .replace(/[-_]+/g, " ")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
    const words = cleaned.split(/\s+/).filter(Boolean);
    const short = words.slice(0, 3).join(" ");
    return short || "Beautiful, fast, simple";
  }
  return "Beautiful, fast, simple";
}

// Pick a sensible default decision when the AI is unavailable.
export function deterministicDecision(
  ctx: PromptContext,
  fileName?: string
): AIDecision {
  return {
    headline: fallbackHeadlineFromName(ctx.appName, fileName),
    subheadline: "",
    mode: "2d",
    positionPreset: "centered",
    backgroundPreset: ctx.gradientPresets[0]?.name || "Indigo Rush",
    accentColor: "#667eea",
    textColor: "light",
    reasoning: "deterministic fallback (AI disabled or unavailable)",
  };
}
