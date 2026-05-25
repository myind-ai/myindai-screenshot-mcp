import { z } from "zod";

export const AIDecisionSchema = z.object({
  headline: z.string().max(80),
  subheadline: z.string().max(160),
  mode: z.enum(["2d", "3d"]),
  positionPreset: z.enum([
    "centered",
    "bleed-bottom",
    "bleed-top",
    "float-center",
    "tilt-left",
    "tilt-right",
    "perspective",
    "float-bottom",
  ]),
  backgroundPreset: z.string(),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#667eea"),
  textColor: z.enum(["light", "dark"]).default("light"),
  reasoning: z.string().default(""),
});

export type AIDecision = z.infer<typeof AIDecisionSchema>;

export const FALLBACK_DECISION: AIDecision = {
  headline: "Beautiful, fast, simple",
  subheadline: "",
  mode: "2d",
  positionPreset: "centered",
  backgroundPreset: "Indigo Rush",
  accentColor: "#667eea",
  textColor: "light",
  reasoning: "fallback (AI unavailable or invalid response)",
};

export interface GenerateInput {
  image: string;
  app_name?: string;
  language?: string;
  device?: "auto" | "iphone-2d" | "iphone-3d";
  hints?: string;
  output_path?: string;
}

export interface GenerateOutput {
  image_base64?: string;
  path?: string;
  decisions: AIDecision;
}
