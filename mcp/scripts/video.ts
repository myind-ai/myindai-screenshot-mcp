#!/usr/bin/env node
/**
 * appscreen-video — produce a polished product video from one or more app screenshots.
 *
 *   npx tsx mcp/scripts/video.ts <out.mp4> <screen1.png> [screen2.png ...] [flags]
 *
 * Flags
 *   --template    cinematic-hero | carousel-flow | orbit-showcase
 *                 5-scene named storyboards that mirror the video_scene.md spec.
 *                 When set, --style is ignored (template owns the look + pacing).
 *   --style       premium|energetic|playful|cinematic        (default: premium)
 *   --duration    total seconds                              (default: auto, 4 + 2.5 per shot, capped 14)
 *   --fps         24 | 30 | 60                               (default: 30)
 *   --mode        2d | 3d                                    (default: 3d)
 *   --device      iphone-6.9 | iphone-6.7 | iphone-6.5       (default: iphone-6.9)
 *   --gradient    "Midnight Abyss" | …                       (default: style-driven)
 *   --accent      #RRGGBB                                    (default: style-driven)
 *   --font        e.g. "Inter"                               (default: style-driven)
 *   --headline    "Master text"                              (per-shot in shot order: --headline a --headline b)
 *   --subheadline "Sub text"                                 (same)
 *   --app-name    "Kaabil"                                   (used if no headlines provided)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EDITING & SCREENPLAY KNOWLEDGE — encoded as constants and structure below.
 * Each rule has a one-line WHY so future edits don't accidentally regress it.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Three-act product video shape: HOOK ▸ DEVELOPMENT ▸ RESOLUTION.
 *   - HOOK  (10–15% of total): land the device + a "what is this" headline. Read in <1s.
 *   - DEV   (60–75%): one feature per beat. Per-shot 2.0–3.0s; shorter rushes, longer wanders.
 *   - RES   (15–20%): pulled-back hero, slow float, tagline holds for last beat.
 *
 * Cut grammar:
 *   - CROSSFADE inside one image's act group (≈0.4s) — emotional continuity.
 *   - MATCH-CUT between images: end-state of clip N equals start-state of clip N+1
 *     (same scale, x, y, rotation), then xfade hides the swap.
 *   - Never cut on a motion peak; cut on a rest beat (≥0.3s settled).
 *   - Mode/positionPreset/device3D never change across a crossfade — they snap at midpoint
 *     and produce visible pops. Pick once in `base` and hold.
 *
 * Motion:
 *   - Easing always ease-in-out; linear reads as "computer animated".
 *   - Tilt entrance: x ±8°, y ±12°, z ±2°. Bigger reads as parody.
 *   - Float idle: y oscillation ≤2px, z rotation ≤0.5°. "Alive" not "shaky".
 *   - Push-in (zoom): scale delta ≤15% per act. Bigger feels like a jump-cut.
 *
 * Text (J-cut / L-cut grammar):
 *   - Headline fades OUT in last 0.25 of the act (J-cut) — leaves before motion exits.
 *   - Next headline fades IN over first 0.30 of the next act (L-cut) — arrives while motion settles.
 *   - One headline per act. Never overlap two.
 *   - Headline ≤4 words; subheadline ≤8 words. Beyond that, layout breaks.
 *
 * Background:
 *   - Gradient lives in `base` and never changes mid-video.
 *   - Glow color tracks accent. Both stable across the whole video.
 *
 * Pacing:
 *   - 24fps cinematic (premium / fintech). 30fps default. 60fps only for rapid swipes.
 *   - Total 4–14s. Under 4 reads as a GIF; over 14 loses retention.
 */

import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { renderVideoConcept } from "../src/tools/video-concept.js";
import { ensureFfmpeg } from "../src/video/ffmpeg.js";
import { shutdown as shutdownBrowser } from "../src/renderer/browser.js";
import type { Concept } from "../src/video/concept.js";
// Spec templates (mcp/video_script/*.json) are compiled by the shared module so
// the CLI and the MCP server stay in sync. The 3 hand-coded templates below
// (cinematic-hero / carousel-flow / orbit-showcase) remain CLI-only.
import {
  buildTemplate as buildSpecTemplate,
  templateExists as specTemplateExists,
  listVideoTemplates as listSpecTemplates,
} from "../src/video/templates.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

// ─── Style presets ──────────────────────────────────────────────────────────
// Each preset is a complete look-and-feel bundle. Adding a new style = one
// entry here; the storyboard generator picks everything else from it.
type StyleKey = "premium" | "energetic" | "playful" | "cinematic";

interface Style {
  fps: number;            // editorial pace; 24 cinematic, 30 default, 60 rapid demo
  mode: "2d" | "3d";      // 3d for hardware-feel hero shots, 2d for content-first apps
  gradient: string;       // background preset name (must exist in app's gradient catalog)
  accent: string;         // hex; drives glow color and pill highlights
  font: string;           // headline font family; subheadline inherits
  fontWeight: string;     // headline weight
  tilt: { x: number; y: number; z: number }; // hero tilt magnitude
  zoomDelta: number;      // push-in scale delta within a feature act (0..0.15)
  hookSec: number;        // hook act duration in seconds
  outroSec: number;       // outro act duration in seconds
  beatSec: number;        // per-feature beat duration in seconds
  crossfadeSec: number;   // act-to-act crossfade
  imageCutXfadeSec: number; // ffmpeg xfade between separate clips (image swaps)
  textColor: "light" | "dark"; // light text on dark gradient, vice-versa
}

const STYLES: Record<StyleKey, Style> = {
  // Premium: still, confident, expensive. Long holds, tiny motion.
  premium: {
    fps: 30,
    mode: "3d",
    gradient: "Midnight Abyss",
    accent: "#7c8df0",
    font: "Inter",
    fontWeight: "700",
    tilt: { x: 6, y: 10, z: 1 },
    zoomDelta: 0.06,
    hookSec: 2.0,
    outroSec: 2.2,
    beatSec: 2.6,
    crossfadeSec: 0.45,
    imageCutXfadeSec: 0.35,
    textColor: "light",
  },
  // Energetic: punchier zooms, faster beats, brighter background. SaaS / consumer.
  energetic: {
    fps: 30,
    mode: "3d",
    gradient: "Neon Horizon",
    accent: "#ff5fa2",
    font: "Outfit",
    fontWeight: "700",
    tilt: { x: 8, y: 12, z: 2 },
    zoomDelta: 0.12,
    hookSec: 1.5,
    outroSec: 1.8,
    beatSec: 2.2,
    crossfadeSec: 0.35,
    imageCutXfadeSec: 0.25,
    textColor: "light",
  },
  // Playful: warm gradient, more rotation play, bouncy timing.
  playful: {
    fps: 30,
    mode: "3d",
    gradient: "Golden Hour",
    accent: "#ff8c5a",
    font: "Plus Jakarta Sans",
    fontWeight: "700",
    tilt: { x: 7, y: 14, z: 3 },
    zoomDelta: 0.10,
    hookSec: 1.6,
    outroSec: 1.8,
    beatSec: 2.4,
    crossfadeSec: 0.40,
    imageCutXfadeSec: 0.30,
    textColor: "light",
  },
  // Cinematic: 24fps, very slow, very dark, very still. Hero only.
  cinematic: {
    fps: 24,
    mode: "3d",
    gradient: "Velvet Noir",
    accent: "#c5a572",
    font: "Playfair Display",
    fontWeight: "700",
    tilt: { x: 5, y: 8, z: 0.5 },
    zoomDelta: 0.04,
    hookSec: 2.4,
    outroSec: 2.6,
    beatSec: 3.0,
    crossfadeSec: 0.55,
    imageCutXfadeSec: 0.40,
    textColor: "light",
  },
};

// ─── CLI parsing ─────────────────────────────────────────────────────────────
// Template slugs are dynamic (loaded from mcp/video_script/*.json + 3 hand-coded).
// Keep as `string` so adding a new spec JSON doesn't require touching this file.
type TemplateKey = string;

interface Cli {
  out: string;
  shots: string[];
  style: StyleKey;
  template?: TemplateKey;
  duration?: number;
  fps?: number;
  mode?: "2d" | "3d";
  device?: "iphone-6.9" | "iphone-6.7" | "iphone-6.5";
  gradient?: string;
  accent?: string;
  font?: string;
  headlines: string[];
  subheadlines: string[];
  appName?: string;
}

function parseCli(argv: string[]): Cli {
  const args = argv.slice(2);
  // Allow `--template list` without positional args.
  if (args.length === 2 && args[0] === "--template" && args[1] === "list") {
    const names = Object.keys(TEMPLATES).sort();
    console.log(`Available templates (${names.length}):`);
    for (const n of names) console.log(`  ${n}`);
    process.exit(0);
  }
  if (args.length < 2) {
    console.error(
      "usage: video.ts <out.mp4> <shot1.png> [shot2.png ...] [--template <name>|list] [--style …] [--headline …] [--subheadline …]"
    );
    process.exit(1);
  }
  const positional: string[] = [];
  const flags: Record<string, string[]> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = args[i + 1];
      if (val === undefined || val.startsWith("--")) {
        (flags[key] ||= []).push("true");
      } else {
        (flags[key] ||= []).push(val);
        i++;
      }
    } else {
      positional.push(a);
    }
  }
  const [out, ...shots] = positional;
  const style = (flags.style?.[0] as StyleKey) || "premium";
  if (!STYLES[style]) {
    console.error(`unknown style "${style}". options: ${Object.keys(STYLES).join(", ")}`);
    process.exit(1);
  }
  const template = flags.template?.[0];
  if (template === "list") {
    const names = Object.keys(TEMPLATES).sort();
    console.log(`Available templates (${names.length}):`);
    for (const n of names) console.log(`  ${n}`);
    process.exit(0);
  }
  if (template && !TEMPLATES[template]) {
    console.error(
      `unknown template "${template}". options: ${Object.keys(TEMPLATES).sort().join(", ")}\n(use --template list to print this from any context)`
    );
    process.exit(1);
  }
  return {
    out: path.resolve(process.cwd(), out),
    shots: shots.map((s) => path.resolve(process.cwd(), s)),
    style,
    template,
    duration: flags.duration ? parseFloat(flags.duration[0]) : undefined,
    fps: flags.fps ? parseInt(flags.fps[0], 10) : undefined,
    mode: flags.mode?.[0] as "2d" | "3d" | undefined,
    device: flags.device?.[0] as Cli["device"],
    gradient: flags.gradient?.[0],
    accent: flags.accent?.[0],
    font: flags.font?.[0],
    headlines: flags.headline ?? [],
    subheadlines: flags.subheadline ?? [],
    appName: flags["app-name"]?.[0],
  };
}

// ─── Headline derivation ─────────────────────────────────────────────────────
// Mirrors mcp/src/ai/prompts.ts fallback rules — strip number prefixes,
// keep ≤4 words, title-case. Keeps the editorial rule (≤4 words) enforced
// even when callers pass nothing.
function deriveHeadline(filePath: string, appName: string | undefined, override?: string): string {
  if (override) return clipWords(override, 4);
  if (appName) return clipWords(appName, 4);
  const stem = path
    .basename(filePath, path.extname(filePath))
    .replace(/^[\d._-]+/, "")
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return clipWords(stem || "Beautiful, fast, simple", 4);
}
function clipWords(s: string, maxWords: number) {
  return s.split(/\s+/).filter(Boolean).slice(0, maxWords).join(" ");
}

// ─── Storyboard ──────────────────────────────────────────────────────────────
// One Concept per shot. Concept structure encodes the editing rules above:
//
//   shot has 1 storyline:
//     [hook?] ─crossfade─ [feature ──crossfade── feature?] ─crossfade─ [outro?]
//
// First shot gets the hook act. Last shot gets the outro act. Middle shots are
// pure feature beats. End-state of every Concept matches start-state of next
// Concept (match-cut), so the ffmpeg xfade between clips is invisible.
//
// Numeric continuity contract (DO NOT BREAK):
//   • base.background = same gradient for ALL shots
//   • base.text.headlineFont = same font everywhere
//   • mode, device3D, positionPreset live in base, never overridden per-act
//   • each act's last keyframe.scale/x/y/rotation == next act's first keyframe
//   • text fade_out of act N + fade_in of act N+1 = J-cut/L-cut

interface Decision {
  [k: string]: any;
}

function buildBase(style: Style, cli: Cli): Decision {
  return {
    mode: cli.mode || style.mode,
    backgroundPreset: cli.gradient || style.gradient,
    textColor: style.textColor,
    accentColor: cli.accent || style.accent,
    background: {
      // Subtle noise prevents banding in dark gradients; standard for premium look.
      noise: true,
      noiseIntensity: 4,
    },
    screenshot: {
      device3D: "iphone",
      // Glow tracks accent, gentle by default. Ramped per-act in motion keyframes.
      glow: { enabled: true, color: cli.accent || style.accent, intensity: 35, size: 90 },
      // Shadow held constant; mid-video shadow change reads as lighting glitch.
      shadow: { enabled: true, color: "#000000", blur: 60, opacity: 35, x: 0, y: 28 },
    },
    text: {
      font: cli.font || style.font,
      headlineFont: cli.font || style.font,
      subheadlineFont: cli.font || style.font,
      headlineWeight: style.fontWeight,
      subheadlineWeight: "500",
      headlineSize: 110,
      subheadlineSize: 56,
      headlineToSubheadlineGap: 28,
      headlineMaxWidthPct: 88,
      subheadlineMaxWidthPct: 80,
      lineHeight: 110,
      position: "top",
      offsetY: 8,
      headlineLetterSpacing: -1,
      subheadlineLetterSpacing: 0,
      subheadlineOpacity: 70,
    },
  };
}

// Three named "poses" — every act starts and ends in one of these so match-cuts
// across acts and shots are exact. Numbers tuned to the editorial rules above.
type Pose = "neutral" | "tilted" | "pulledBack";

function pose(p: Pose, style: Style): Decision {
  const t = style.tilt;
  switch (p) {
    case "neutral":
      // Centered hero; reading rest position.
      return {
        positionPreset: "centered",
        screenshot: {
          scale: 78,
          x: 50, y: 60,
          rotation: 0,
          perspective: 0,
          rotation3D: { x: 0, y: 0, z: 0 },
          glow: { intensity: 35 },
        },
      };
    case "tilted":
      // Three-quarter hero — hook entrance & feature emphasis.
      return {
        positionPreset: "centered",
        screenshot: {
          scale: 82,
          x: 50, y: 58,
          rotation: 0,
          perspective: 0,
          rotation3D: { x: t.x, y: t.y, z: t.z },
          glow: { intensity: 50 },
        },
      };
    case "pulledBack":
      // Outro — small, contemplative, gives space for the tagline.
      return {
        positionPreset: "centered",
        screenshot: {
          scale: 70,
          x: 50, y: 64,
          rotation: 0,
          perspective: 0,
          rotation3D: { x: 0, y: 0, z: 0 },
          glow: { intensity: 30 },
        },
      };
  }
}

// Merge utility — deep-spreads decision deltas (motion keyframes are deltas, not full decisions).
function merged(...parts: Decision[]): Decision {
  const out: Decision = {};
  for (const p of parts) deepAssign(out, p);
  return out;
}
function deepAssign(dst: any, src: any) {
  for (const k of Object.keys(src)) {
    const v = src[k];
    if (v && typeof v === "object" && !Array.isArray(v) && typeof dst[k] === "object" && dst[k] !== null) {
      deepAssign(dst[k], v);
    } else {
      dst[k] = v;
    }
  }
}

interface ShotPlan {
  imagePath: string;
  isFirst: boolean;
  isLast: boolean;
  headline: string;
  subheadline: string;
}

function buildConceptForShot(plan: ShotPlan, style: Style, base: Decision): Concept {
  const { isFirst, isLast, headline, subheadline } = plan;
  const acts: Concept["acts"] = [];

  // J-cut/L-cut text fade timings as fractions of act duration.
  const FADE_IN = 0.30;  // L-cut: text arrives during settle
  const FADE_OUT = 0.25; // J-cut: text leaves before motion exits
  const HOLD = 1 - FADE_IN - FADE_OUT;

  // ── HOOK (only on first shot) ─
  // Tilted entrance → settles to neutral. Headline fades in late so the device
  // motion lands first; the user sees the product before they read.
  if (isFirst) {
    acts.push({
      name: "hook",
      duration: style.hookSec,
      motion: [
        { t: 0, decision: merged(pose("tilted", style), { screenshot: { scale: 60 } }) },
        { t: 1, decision: pose("neutral", style) },
      ],
      text: {
        headline,
        subheadline,
        fade_in: 0.45,        // longer fade-in: device lands first, then text arrives
        hold: 0.45,
        fade_out: FADE_OUT,
      },
      transition: { kind: "crossfade", duration: style.crossfadeSec },
    });
  }

  // ── FEATURE BEAT(s) ─
  // Every shot gets exactly one feature beat — single image per beat is the
  // editorial rule. Subtle push-in to draw the eye; ends back at neutral so the
  // next act/shot can match-cut from neutral.
  acts.push({
    name: "feature",
    duration: style.beatSec,
    motion: [
      { t: 0, decision: pose("neutral", style) },
      {
        t: 0.5,
        // Push-in midpoint — peak emphasis. Glow brightens for accent.
        decision: merged(pose("neutral", style), {
          screenshot: {
            scale: 78 + Math.round(style.zoomDelta * 100),
            rotation3D: { x: style.tilt.x * 0.4, y: style.tilt.y * 0.4, z: 0 },
            glow: { intensity: 60 },
          },
        }),
      },
      { t: 1, decision: pose("neutral", style) },
    ],
    text: {
      headline,
      subheadline,
      fade_in: FADE_IN,
      hold: HOLD,
      fade_out: FADE_OUT,
    },
    transition: { kind: "crossfade", duration: style.crossfadeSec },
  });

  // ── OUTRO (only on last shot) ─
  // Pulls back, slow float micro-sway, tagline holds longer (no fade_out — let
  // the final frame breathe).
  if (isLast) {
    acts.push({
      name: "outro",
      duration: style.outroSec,
      motion: [
        { t: 0, decision: pose("neutral", style) },
        // Micro-sway midpoint — the "alive" beat.
        {
          t: 0.5,
          decision: merged(pose("pulledBack", style), {
            screenshot: { rotation3D: { x: 1, y: -1, z: 0 } },
          }),
        },
        { t: 1, decision: pose("pulledBack", style) },
      ],
      text: {
        headline,
        subheadline,
        fade_in: FADE_IN,
        hold: 1 - FADE_IN, // no fade_out: hold the CTA
        fade_out: 0,
      },
      // Last act's transition is ignored by planFrames, but spec it for clarity.
      transition: { kind: "cut" },
    });
  }

  return { base, acts };
}

// ─── Named templates ─────────────────────────────────────────────────────────
// Five-scene storyboards that mirror the spec at appscreen-output/.../video_scene.md
// 1:1 in pacing and intent. Where the spec calls for things the renderer can't
// literally do (multi-phone fan-outs, mid-frame screen swaps, particles, lottie),
// we degrade to the closest single-phone equivalent — clearly noted inline.
//
// Each template returns a list of ClipPlans. A ClipPlan is one renderVideoConcept
// call (one image, one Concept). Image swaps between scenes become clip
// boundaries, joined later with ffmpeg xfade so the swap reads as a soft cut.
//
// Helpers:
//   - shot(i): cycles through provided shots when the template needs more
//     screens than the user provided. Repeats are gentle (the editorial arc
//     still makes sense).
//   - h(i)/s(i): per-scene headline / subheadline with sensible fallbacks.
//   - The base.background and font come from the TEMPLATE, not from --style.
interface ClipPlan {
  image: string;
  concept: Concept;
  label: string;
}

interface TemplateCtx {
  shots: string[];
  headlines: string[];
  subheadlines: string[];
  appName?: string;
  fps: number;
  mode: "2d" | "3d";
  device3D: "iphone" | "samsung";
  fontOverride?: string;
  gradientOverride?: string;
  accentOverride?: string;
}

function pickShot(ctx: TemplateCtx, i: number): string {
  return ctx.shots[i % ctx.shots.length];
}
function pickHeadline(ctx: TemplateCtx, i: number, fallback: string): string {
  const h = ctx.headlines[i] || (ctx.appName ? clipWords(ctx.appName, 4) : fallback);
  return clipWords(h, 4);
}
function pickSub(ctx: TemplateCtx, i: number, fallback = ""): string {
  return clipWords(ctx.subheadlines[i] || fallback, 8);
}

// Shared base look for any template — overridden per template by gradient/accent.
function templateBase(ctx: TemplateCtx, gradient: string, accent: string, font: string, textColor: "light" | "dark", fontWeight = "700"): Decision {
  return {
    mode: ctx.mode,
    backgroundPreset: ctx.gradientOverride || gradient,
    textColor,
    accentColor: ctx.accentOverride || accent,
    background: { noise: true, noiseIntensity: 4 },
    screenshot: {
      device3D: ctx.device3D,
      glow: { enabled: true, color: ctx.accentOverride || accent, intensity: 35, size: 90 },
      shadow: { enabled: true, color: "#000000", blur: 60, opacity: textColor === "dark" ? 18 : 35, x: 0, y: 28 },
    },
    text: {
      font: ctx.fontOverride || font,
      headlineFont: ctx.fontOverride || font,
      subheadlineFont: ctx.fontOverride || font,
      headlineWeight: fontWeight,
      subheadlineWeight: "500",
      headlineSize: 110,
      subheadlineSize: 56,
      headlineToSubheadlineGap: 28,
      headlineMaxWidthPct: 88,
      subheadlineMaxWidthPct: 80,
      lineHeight: 110,
      position: "top",
      offsetY: 8,
      headlineLetterSpacing: -1,
      subheadlineLetterSpacing: 0,
      subheadlineOpacity: textColor === "dark" ? 60 : 70,
    },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// TEMPLATE 1 ─ CINEMATIC HERO REVEAL  (18s, dark premium)
// Spec scenes:
//   1. reveal       0–4s    home rises from below, scale 0.7→1.0, 3D tilt settles
//   2. zoom_in      4–8s    zoom into screen 2.8x, blur builds at end
//   3. screen_swap  8–12s   crossfade home→dashboard, scale back to 1.0, small tilt
//   4. multi_screen 12–15.5s  three phones fan out  (DEGRADED → single phone fast-fan)
//   5. outro        15.5–18s  phones fly out + logo + "Download Now"
// Clip layout: [home: scenes 1+2 = 8s] [dashboard: scene 3 = 4s] [fallback: scenes 4+5 = 6s]
// ════════════════════════════════════════════════════════════════════════════
function templateCinematicHero(ctx: TemplateCtx): { clips: ClipPlan[]; base: Decision; xfadeSec: number } {
  const base = templateBase(ctx, "Carbon Slate", "#7c8df0", "Inter", "light", "700");
  const clips: ClipPlan[] = [];

  // ── Clip 1: scene 1 (reveal) + scene 2 (zoom_in) on shot[0]
  clips.push({
    image: pickShot(ctx, 0),
    label: "scene_1_reveal + scene_2_zoom_in",
    concept: {
      base,
      acts: [
        {
          name: "scene_1_reveal",
          duration: 4,
          motion: [
            // Rise from below, tilt settles — "phone rises from below" cinematic entrance.
            { t: 0, decision: { screenshot: { scale: 55, x: 50, y: 130, rotation: 0, rotation3D: { x: 25, y: -15, z: 0 }, glow: { intensity: 0 } } } },
            { t: 0.625, decision: { screenshot: { scale: 78, x: 50, y: 60, rotation: 0, rotation3D: { x: 0, y: 0, z: 0 }, glow: { intensity: 50 } } } },
            { t: 1.0, decision: { screenshot: { scale: 78, x: 50, y: 60, rotation3D: { x: 0, y: 0, z: 0 }, glow: { intensity: 50 } } } },
          ],
          text: {
            headline: pickHeadline(ctx, 0, "Your App Name"),
            subheadline: pickSub(ctx, 0),
            // Spec: text appears at 2.5s of 4s scene (delay 0.625) — long fade, hold, no fade-out (carries into zoom).
            fade_in: 0.30,
            hold: 0.70,
            fade_out: 0.0,
          },
          transition: { kind: "crossfade", duration: 0.4 },
        },
        {
          name: "scene_2_zoom_in",
          duration: 4,
          motion: [
            // Push-in — "zoom into screen 2.8x". Cap at 110 (2.8x natural would be ~220 but
            // overshoots safe area; 110 reads as "we got close" without breaking layout).
            { t: 0, decision: { screenshot: { scale: 78, x: 50, y: 60, rotation3D: { x: 0, y: 0, z: 0 }, glow: { intensity: 50 } } } },
            { t: 0.625, decision: { screenshot: { scale: 110, x: 42, y: 50, rotation3D: { x: 2, y: -3, z: 0 }, glow: { intensity: 70 } } } },
            { t: 1.0, decision: { screenshot: { scale: 110, x: 42, y: 50, rotation3D: { x: 2, y: -3, z: 0 }, glow: { intensity: 70 } } } },
          ],
          text: {
            // Spec: "Smart Dashboard" text appears at 1.5s of 4s — second headline emphasising the feature.
            headline: pickHeadline(ctx, 1, "Smart Dashboard"),
            subheadline: pickSub(ctx, 1),
            fade_in: 0.375,
            hold: 0.50,
            fade_out: 0.125,
          },
          transition: { kind: "cut" }, // image swap → cut, ffmpeg xfade across the clip boundary
        },
      ],
    },
  });

  // ── Clip 2: scene 3 (screen_swap) on shot[1] — pulls back to neutral, then small tilt.
  clips.push({
    image: pickShot(ctx, 1),
    label: "scene_3_screen_swap",
    concept: {
      base,
      acts: [
        {
          name: "scene_3_screen_swap",
          duration: 4,
          motion: [
            // Match-cut entry: same scale/position as the OUTGOING zoom end → ffmpeg xfade is invisible.
            { t: 0, decision: { screenshot: { scale: 110, x: 42, y: 50, rotation3D: { x: 2, y: -3, z: 0 }, glow: { intensity: 70 } } } },
            // "Scale back to 1.0, position center" — matches spec scene_3.
            { t: 0.375, decision: { screenshot: { scale: 78, x: 50, y: 60, rotation3D: { x: 0, y: 0, z: 0 }, glow: { intensity: 50 } } } },
            // "Small tilt" at the end — spec rotateX 5, rotateY -10.
            { t: 1.0, decision: { screenshot: { scale: 78, x: 50, y: 60, rotation3D: { x: 4, y: -8, z: 0 }, glow: { intensity: 55 } } } },
          ],
          text: {
            headline: pickHeadline(ctx, 2, "Powerful Features"),
            subheadline: pickSub(ctx, 2),
            fade_in: 0.30,
            hold: 0.60,
            fade_out: 0.10,
          },
          transition: { kind: "cut" },
        },
      ],
    },
  });

  // ── Clip 3: scenes 4 (multi-screen, degraded) + 5 (outro) on shot[2] (or fallback)
  // Multi-screen degrade: single phone fast-fans through left → center → right
  // positions in 1.5s, mimicking the layout intent without three real phones.
  clips.push({
    image: pickShot(ctx, 2),
    label: "scene_4_multi_screen + scene_5_outro",
    concept: {
      base,
      acts: [
        {
          name: "scene_4_multi_fan",
          duration: 3.5,
          motion: [
            // Match-cut entry from the previous tilt end.
            { t: 0, decision: { screenshot: { scale: 78, x: 50, y: 60, rotation3D: { x: 4, y: -8, z: 0 }, glow: { intensity: 55 } } } },
            // Fan left.
            { t: 0.20, decision: { screenshot: { scale: 60, x: 22, y: 58, rotation3D: { x: 5, y: 20, z: 0 }, glow: { intensity: 50 } } } },
            // Fan center.
            { t: 0.55, decision: { screenshot: { scale: 70, x: 50, y: 55, rotation3D: { x: 0, y: 0, z: 0 }, glow: { intensity: 60 } } } },
            // Fan right.
            { t: 0.85, decision: { screenshot: { scale: 60, x: 78, y: 58, rotation3D: { x: 5, y: -20, z: 0 }, glow: { intensity: 50 } } } },
            // Settle to center for outro hand-off.
            { t: 1.0, decision: { screenshot: { scale: 75, x: 50, y: 60, rotation3D: { x: 0, y: 0, z: 0 }, glow: { intensity: 55 } } } },
          ],
          text: {
            headline: pickHeadline(ctx, 3, "All In One"),
            subheadline: pickSub(ctx, 3),
            fade_in: 0.20,
            hold: 0.65,
            fade_out: 0.15,
          },
          transition: { kind: "crossfade", duration: 0.4 },
        },
        {
          name: "scene_5_outro",
          duration: 2.5,
          motion: [
            // Phone shrinks toward top — leaves room for CTA text below (spec has logo+"Download Now").
            { t: 0, decision: { screenshot: { scale: 75, x: 50, y: 60, rotation3D: { x: 0, y: 0, z: 0 }, glow: { intensity: 55 } } } },
            { t: 0.5, decision: { screenshot: { scale: 50, x: 50, y: 38, rotation3D: { x: 0, y: 0, z: 0 }, glow: { intensity: 70 } } } },
            { t: 1.0, decision: { screenshot: { scale: 45, x: 50, y: 38, rotation3D: { x: 0, y: 0, z: 0 }, glow: { intensity: 65 } } } },
          ],
          text: {
            // Last act: CTA. Headline = app name; subheadline = "Download Now" by default.
            headline: ctx.appName ? clipWords(ctx.appName, 4) : pickHeadline(ctx, 4, "Your App"),
            subheadline: pickSub(ctx, 4, "Download Now"),
            fade_in: 0.30,
            hold: 0.70,
            fade_out: 0,
          },
          transition: { kind: "cut" },
        },
      ],
    },
  });

  return { clips, base, xfadeSec: 0.40 };
}

// ════════════════════════════════════════════════════════════════════════════
// TEMPLATE 2 ─ CAROUSEL FLOW  (15s, clean white)
// Spec scenes:
//   1. drop_in     0–3s    onboarding drops from top with rotation, springy.
//   2. slide_left  3–6s    onboarding exits left, home enters from right.
//   3. slide_up    6–9s    home → detail, screen scrolls upward.
//   4. flip        9–12s   detail → checkout via 360 Y rotation, image swap at midpoint.
//   5. success     12–15s  checkout → success, scale down to logo position.
// Clip layout: 5 clips, one per scene (each scene swaps the active screen).
// ════════════════════════════════════════════════════════════════════════════
function templateCarouselFlow(ctx: TemplateCtx): { clips: ClipPlan[]; base: Decision; xfadeSec: number } {
  // Spec uses solid #f5f5f7 (off-white). Map to closest gradient preset visually:
  // "Morning Mist" is the lightest preset in the catalog.
  const base = templateBase(ctx, "Morning Mist", "#007AFF", "Plus Jakarta Sans", "dark", "700");
  const clips: ClipPlan[] = [];

  // Common neutral "rest" pose for match-cuts between clips.
  const neutral = { scale: 80, x: 50, y: 50, rotation: 0, rotation3D: { x: 0, y: 0, z: 0 }, glow: { intensity: 25 } };

  // ── Clip 1: drop_in
  clips.push({
    image: pickShot(ctx, 0),
    label: "scene_1_drop_in",
    concept: {
      base,
      acts: [{
        name: "scene_1_drop_in",
        duration: 3,
        motion: [
          // Drops from above — y:-40 spec → renderer y:-30 (off-canvas top).
          { t: 0, decision: { screenshot: { scale: 80, x: 50, y: -30, rotation: -8, rotation3D: { x: 0, y: 0, z: 0 }, glow: { intensity: 0 } } } },
          // Spring-style overshoot midway then settle (renderer easing is ease-in-out;
          // approximate the spring by slight overshoot at t=0.7 then ease back).
          { t: 0.6, decision: { screenshot: { scale: 82, x: 50, y: 47, rotation: 1, rotation3D: { x: 0, y: 0, z: 0 }, glow: { intensity: 25 } } } },
          { t: 1.0, decision: { screenshot: neutral } },
        ],
        text: {
          headline: pickHeadline(ctx, 0, "Getting Started"),
          subheadline: pickSub(ctx, 0),
          fade_in: 0.60, // spec text appears at 1.8s of 3s
          hold: 0.30,
          fade_out: 0.10,
        },
        transition: { kind: "cut" },
      }],
    },
  });

  // ── Clip 2: slide_left  (onboarding exits left during xfade with clip 1's tail.
  // We render this clip starting OFF-screen-right and sliding to center, so the
  // ffmpeg xfade between clip1's end (centered) and clip2's start (off-right)
  // creates the illusion of "old slides left, new slides in from right".)
  clips.push({
    image: pickShot(ctx, 1),
    label: "scene_2_slide_left",
    concept: {
      base,
      acts: [{
        name: "scene_2_slide_left",
        duration: 3,
        motion: [
          // Enter from right.
          { t: 0, decision: { screenshot: { scale: 80, x: 140, y: 50, rotation: 0, rotation3D: { x: 0, y: 0, z: 0 }, glow: { intensity: 25 } } } },
          { t: 0.4, decision: { screenshot: neutral } },
          { t: 1.0, decision: { screenshot: neutral } },
        ],
        text: {
          headline: pickHeadline(ctx, 1, "Your Home Feed"),
          subheadline: pickSub(ctx, 1),
          fade_in: 0.50,
          hold: 0.40,
          fade_out: 0.10,
        },
        transition: { kind: "cut" },
      }],
    },
  });

  // ── Clip 3: slide_up — phone enters from below to center, simulating "screen scrolls up".
  clips.push({
    image: pickShot(ctx, 2),
    label: "scene_3_slide_up",
    concept: {
      base,
      acts: [{
        name: "scene_3_slide_up",
        duration: 3,
        motion: [
          { t: 0, decision: { screenshot: { scale: 80, x: 50, y: 130, rotation: 0, rotation3D: { x: 0, y: 0, z: 0 }, glow: { intensity: 25 } } } },
          { t: 0.33, decision: { screenshot: neutral } },
          { t: 1.0, decision: { screenshot: neutral } },
        ],
        text: {
          headline: pickHeadline(ctx, 2, "View Details"),
          subheadline: pickSub(ctx, 2),
          fade_in: 0.40,
          hold: 0.50,
          fade_out: 0.10,
        },
        transition: { kind: "cut" },
      }],
    },
  });

  // ── Clip 4: flip — full Y rotation. Renderer rotation3D.y is clamped -180..180,
  // so we approximate a 360 spin via three keyframes: 0° → 180° (back-facing) → 360° normalised back to 0°.
  // The spec swaps the image at midpoint when phone is back-facing — we use a hard
  // cut between this clip and the next at the natural end of rotation, so the
  // outgoing image is fully turned away when ffmpeg xfade kicks in.
  clips.push({
    image: pickShot(ctx, 3),
    label: "scene_4_flip",
    concept: {
      base,
      acts: [{
        name: "scene_4_flip",
        duration: 3,
        motion: [
          { t: 0, decision: { screenshot: neutral } },
          { t: 0.50, decision: { screenshot: { scale: 80, x: 50, y: 50, rotation: 0, rotation3D: { x: 0, y: 180, z: 0 }, glow: { intensity: 40 } } } },
          // Snap back to 0 visually (the renderer doesn't continuous-rotate past 180; the
          // clip ends face-on so the next clip can match-cut.)
          { t: 0.51, decision: { screenshot: { scale: 80, x: 50, y: 50, rotation: 0, rotation3D: { x: 0, y: -180, z: 0 }, glow: { intensity: 40 } } } },
          { t: 1.0, decision: { screenshot: neutral } },
        ],
        text: {
          headline: pickHeadline(ctx, 3, "Seamless Checkout"),
          subheadline: pickSub(ctx, 3),
          fade_in: 0.60, // spec text appears at 1.8s of 3s
          hold: 0.30,
          fade_out: 0.10,
        },
        transition: { kind: "cut" },
      }],
    },
  });

  // ── Clip 5: success outro — scale down + move up, settle for "Available on the App Store".
  clips.push({
    image: pickShot(ctx, 4),
    label: "scene_5_success_outro",
    concept: {
      base,
      acts: [{
        name: "scene_5_success_outro",
        duration: 3,
        motion: [
          { t: 0, decision: { screenshot: neutral } },
          { t: 0.5, decision: { screenshot: { scale: 55, x: 50, y: 35, rotation: 0, rotation3D: { x: 0, y: 0, z: 0 }, glow: { intensity: 35 } } } },
          { t: 1.0, decision: { screenshot: { scale: 50, x: 50, y: 30, rotation: 0, rotation3D: { x: 0, y: 0, z: 0 }, glow: { intensity: 30 } } } },
        ],
        text: {
          headline: ctx.appName ? clipWords(ctx.appName, 4) : pickHeadline(ctx, 4, "Available Now"),
          subheadline: pickSub(ctx, 4, "Available on the App Store"),
          fade_in: 0.45,
          hold: 0.55,
          fade_out: 0,
        },
        transition: { kind: "cut" },
      }],
    },
  });

  return { clips, base, xfadeSec: 0.30 };
}

// ════════════════════════════════════════════════════════════════════════════
// TEMPLATE 3 ─ ORBIT SHOWCASE  (20s, dark gradient, 3D)
// Spec scenes:
//   1. orbit_in     0–5s     phone spins in from side, big rotateY -90→-15
//   2. slow_orbit   5–10s    splash→feed crossfade + continuous gentle orbit
//   3. tilt_zoom    10–14s   feed→create slide + dramatic 35° rotateX, scale 0.9→1.3
//   4. triple_orbit 14–17.5s 3 phones floating in 3D space (DEGRADED → fast solo orbit)
//   5. converge     17.5–20s converge into logo
// Clip layout: 4 clips. Scene 1 alone, scene 2 alone, scene 3 alone, scenes 4+5 share clip.
// ════════════════════════════════════════════════════════════════════════════
function templateOrbitShowcase(ctx: TemplateCtx): { clips: ClipPlan[]; base: Decision; xfadeSec: number } {
  const base = templateBase(ctx, "Synthwave Dusk", "#a78bfa", "Inter", "light", "700");
  const clips: ClipPlan[] = [];

  // ── Clip 1: orbit_in (5s) — splash
  clips.push({
    image: pickShot(ctx, 0),
    label: "scene_1_orbit_in",
    concept: {
      base,
      acts: [{
        name: "scene_1_orbit_in",
        duration: 5,
        motion: [
          // Spec: from x:120 y:60 rotateY:-90 scale:0.3 → x:50 y:48 rotateY:-15 scale:0.9
          { t: 0, decision: { screenshot: { scale: 25, x: 120, y: 60, rotation: 0, rotation3D: { x: 30, y: -90, z: 0 }, glow: { intensity: 0 } } } },
          { t: 0.7, decision: { screenshot: { scale: 70, x: 50, y: 48, rotation: 0, rotation3D: { x: 10, y: -15, z: 0 }, glow: { intensity: 50 } } } },
          { t: 1.0, decision: { screenshot: { scale: 70, x: 50, y: 48, rotation: 0, rotation3D: { x: 10, y: -15, z: 0 }, glow: { intensity: 55 } } } },
        ],
        text: {
          headline: pickHeadline(ctx, 0, ctx.appName || "Your Story"),
          subheadline: pickSub(ctx, 0),
          fade_in: 0.40,
          hold: 0.55,
          fade_out: 0.05,
        },
        transition: { kind: "cut" },
      }],
    },
  });

  // ── Clip 2: slow_orbit (5s) — feed (image swap from splash via xfade)
  clips.push({
    image: pickShot(ctx, 1),
    label: "scene_2_slow_orbit",
    concept: {
      base,
      acts: [{
        name: "scene_2_slow_orbit",
        duration: 5,
        motion: [
          // Match-cut entry: identical pose to clip 1's end → ffmpeg xfade hides the image swap.
          { t: 0, decision: { screenshot: { scale: 70, x: 50, y: 48, rotation: 0, rotation3D: { x: 10, y: -15, z: 0 }, glow: { intensity: 55 } } } },
          // Spec: continuous gentle orbit rotateX 10→-5, rotateY -15→15 over 5s.
          { t: 0.5, decision: { screenshot: { scale: 70, x: 50, y: 47, rotation3D: { x: 3, y: 0, z: 0 }, glow: { intensity: 60 } } } },
          { t: 1.0, decision: { screenshot: { scale: 70, x: 50, y: 46, rotation3D: { x: -5, y: 15, z: 0 }, glow: { intensity: 55 } } } },
        ],
        text: {
          headline: pickHeadline(ctx, 1, "Discover Your Feed"),
          subheadline: pickSub(ctx, 1),
          // Spec: text fades in at 1.5s, fades out at 4s (fade-in fade-out within scene)
          fade_in: 0.30,
          hold: 0.50,
          fade_out: 0.20,
        },
        transition: { kind: "cut" },
      }],
    },
  });

  // ── Clip 3: tilt_zoom (4s) — create
  clips.push({
    image: pickShot(ctx, 2),
    label: "scene_3_tilt_zoom",
    concept: {
      base,
      acts: [{
        name: "scene_3_tilt_zoom",
        duration: 4,
        motion: [
          // Match-cut entry: matches clip 2's end pose.
          { t: 0, decision: { screenshot: { scale: 70, x: 50, y: 46, rotation: 0, rotation3D: { x: -5, y: 15, z: 0 }, glow: { intensity: 55 } } } },
          // Spec: rotateX -5→35 (dramatic backward tilt), scale 0.9→1.3, position y 46→55.
          // Cap rotateX at 28° (35° starts to look glitchy with the renderer).
          { t: 0.5, decision: { screenshot: { scale: 100, x: 50, y: 55, rotation3D: { x: 28, y: 0, z: 0 }, glow: { intensity: 80 } } } },
          // Spec: recover to subtle rotateX 5, rotateY -10.
          { t: 1.0, decision: { screenshot: { scale: 90, x: 50, y: 50, rotation3D: { x: 4, y: -8, z: 0 }, glow: { intensity: 65 } } } },
        ],
        text: {
          headline: pickHeadline(ctx, 2, "Create Anything"),
          subheadline: pickSub(ctx, 2),
          fade_in: 0.30,
          hold: 0.55,
          fade_out: 0.15,
        },
        transition: { kind: "cut" },
      }],
    },
  });

  // ── Clip 4: triple_orbit (3.5s, degraded) + converge (2.5s)
  // Degrade: solo phone fast-orbits through left/center/right positions (mimicking
  // the three-phone fan), then converges into a centered shrink for the outro.
  clips.push({
    image: pickShot(ctx, 3),
    label: "scene_4_triple_orbit + scene_5_converge",
    concept: {
      base,
      acts: [
        {
          name: "scene_4_triple_fan",
          duration: 3.5,
          motion: [
            // Match-cut entry from clip 3 end pose.
            { t: 0, decision: { screenshot: { scale: 90, x: 50, y: 50, rotation3D: { x: 4, y: -8, z: 0 }, glow: { intensity: 65 } } } },
            // Left orbit position.
            { t: 0.30, decision: { screenshot: { scale: 50, x: 18, y: 50, rotation3D: { x: 8, y: 30, z: 0 }, glow: { intensity: 55 } } } },
            // Center pop.
            { t: 0.55, decision: { screenshot: { scale: 60, x: 50, y: 46, rotation3D: { x: 3, y: 0, z: 0 }, glow: { intensity: 70 } } } },
            // Right orbit position.
            { t: 0.85, decision: { screenshot: { scale: 50, x: 82, y: 50, rotation3D: { x: 8, y: -30, z: 0 }, glow: { intensity: 55 } } } },
            // Converge to center for the outro hand-off.
            { t: 1.0, decision: { screenshot: { scale: 65, x: 50, y: 48, rotation3D: { x: 0, y: 0, z: 0 }, glow: { intensity: 65 } } } },
          ],
          text: {
            headline: pickHeadline(ctx, 3, "Connect & Share"),
            subheadline: pickSub(ctx, 3),
            fade_in: 0.20,
            hold: 0.65,
            fade_out: 0.15,
          },
          transition: { kind: "crossfade", duration: 0.4 },
        },
        {
          name: "scene_5_converge_exit",
          duration: 2.5,
          motion: [
            { t: 0, decision: { screenshot: { scale: 65, x: 50, y: 48, rotation3D: { x: 0, y: 0, z: 0 }, glow: { intensity: 65 } } } },
            { t: 0.5, decision: { screenshot: { scale: 35, x: 50, y: 38, rotation3D: { x: 0, y: 0, z: 0 }, glow: { intensity: 90 } } } },
            { t: 1.0, decision: { screenshot: { scale: 30, x: 50, y: 38, rotation3D: { x: 0, y: 0, z: 0 }, glow: { intensity: 80 } } } },
          ],
          text: {
            headline: ctx.appName ? clipWords(ctx.appName, 4) : pickHeadline(ctx, 4, "Available Now"),
            subheadline: pickSub(ctx, 4, "Available Now"),
            fade_in: 0.30,
            hold: 0.70,
            fade_out: 0,
          },
          transition: { kind: "cut" },
        },
      ],
    },
  });

  return { clips, base, xfadeSec: 0.40 };
}

const HAND_TEMPLATES: Record<string, (ctx: TemplateCtx) => { clips: ClipPlan[]; base: Decision; xfadeSec: number }> = {
  "cinematic-hero": templateCinematicHero,
  "carousel-flow": templateCarouselFlow,
  "orbit-showcase": templateOrbitShowcase,
};

// ─── Spec templates from src/video/templates.ts ──────────────────────────────
// The 20+ JSON storyboards in mcp/video_script/ are loaded and compiled by the
// shared module so the CLI and the MCP server stay in sync. Hand-coded
// templates win on slug collision.
const TEMPLATES: Record<string, (ctx: TemplateCtx) => { clips: ClipPlan[]; base: Decision; xfadeSec: number }> = {};
for (const meta of listSpecTemplates()) {
  TEMPLATES[meta.slug] = (ctx: TemplateCtx) =>
    buildSpecTemplate(meta.slug, ctx as any) as any;
}
Object.assign(TEMPLATES, HAND_TEMPLATES);
void specTemplateExists; // re-exported for future callers

// ─── Concat clips with ffmpeg xfade ──────────────────────────────────────────
// Why xfade and not concat: concat demuxer hard-cuts. xfade gives a controllable
// crossfade between separate MP4s — perfect for image-swap boundaries where the
// source decision can't blend (different image data).
async function concatWithXfade(clips: string[], out: string, xfadeSec: number): Promise<void> {
  if (clips.length === 1) {
    await fs.copyFile(clips[0], out);
    return;
  }
  await ensureFfmpeg();

  // Probe each clip's duration via ffprobe; ffmpeg xfade needs an `offset` per clip.
  const durations = await Promise.all(clips.map(probeDuration));

  // Build the filter graph:
  //   [0:v][1:v]xfade=transition=fade:duration=X:offset=D0-X[v01];
  //   [v01][2:v]xfade=…:offset=(D0+D1-2X)[v02]; …
  // Offsets accumulate; each xfade trims the leading duration by X.
  const inputs = clips.flatMap((c) => ["-i", c]);
  const filters: string[] = [];
  let cumulativeOffset = durations[0] - xfadeSec;
  let prev = "0:v";
  for (let i = 1; i < clips.length; i++) {
    const out = i === clips.length - 1 ? "vout" : `v${i}`;
    filters.push(
      `[${prev}][${i}:v]xfade=transition=fade:duration=${xfadeSec}:offset=${cumulativeOffset.toFixed(3)}[${out}]`
    );
    prev = out;
    cumulativeOffset += durations[i] - xfadeSec;
  }

  const args = [
    ...inputs,
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[vout]",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "medium",
    "-crf",
    "18",
    "-movflags",
    "+faststart",
    "-y",
    out,
  ];

  await runFfmpeg(args);
}

async function probeDuration(file: string): Promise<number> {
  const { stdout } = await runCmd("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    file,
  ]);
  return parseFloat(stdout.trim());
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "inherit"] });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  });
}

function runCmd(cmd: string, args: string[]): Promise<{ stdout: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "inherit"] });
    let stdout = "";
    p.stdout.on("data", (b) => (stdout += b.toString()));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve({ stdout }) : reject(new Error(`${cmd} exited ${code}`))
    );
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const cli = parseCli(process.argv);
  const style: Style = {
    ...STYLES[cli.style],
    ...(cli.fps ? { fps: cli.fps } : {}),
    ...(cli.mode ? { mode: cli.mode } : {}),
  };

  // Validate inputs exist before booting Chromium.
  for (const s of cli.shots) {
    try {
      await fs.access(s);
    } catch {
      console.error(`shot not found: ${s}`);
      process.exit(1);
    }
  }
  await fs.mkdir(path.dirname(cli.out), { recursive: true });

  // Build clip plans — either from a named template or from the auto storyboard.
  let clipPlans: ClipPlan[];
  let xfadeSec: number;
  if (cli.template) {
    const ctx: TemplateCtx = {
      shots: cli.shots,
      headlines: cli.headlines,
      subheadlines: cli.subheadlines,
      appName: cli.appName,
      fps: style.fps,
      mode: cli.mode || style.mode,
      device3D: "iphone",
      fontOverride: cli.font,
      gradientOverride: cli.gradient,
      accentOverride: cli.accent,
    };
    const built = TEMPLATES[cli.template](ctx);
    clipPlans = built.clips;
    xfadeSec = built.xfadeSec;
    console.log(`[video] template=${cli.template} fps=${style.fps} clips=${clipPlans.length} shots=${cli.shots.length}`);
  } else {
    const base = buildBase(style, cli);

    // Optional global duration reshape: scale per-beat seconds to hit `--duration`.
    // Editorial rules are preserved (hook/outro proportions stay constant).
    if (cli.duration) {
      const naturalTotal =
        style.hookSec + style.outroSec + cli.shots.length * style.beatSec;
      const factor = cli.duration / naturalTotal;
      style.hookSec *= factor;
      style.outroSec *= factor;
      style.beatSec *= factor;
    }

    const shotPlans: ShotPlan[] = cli.shots.map((p, i) => ({
      imagePath: p,
      isFirst: i === 0,
      isLast: i === cli.shots.length - 1,
      headline: deriveHeadline(p, cli.appName, cli.headlines[i]),
      subheadline: cli.subheadlines[i] || "",
    }));

    clipPlans = shotPlans.map((plan, i) => ({
      image: plan.imagePath,
      concept: buildConceptForShot(plan, style, base),
      label: `auto-${i}-${plan.headline}`,
    }));
    xfadeSec = style.imageCutXfadeSec;
    console.log(`[video] style=${cli.style} fps=${style.fps} shots=${shotPlans.length}`);
  }
  console.log(`[video] out=${cli.out}`);

  // Render one mp4 per ClipPlan.
  const clipsDir = path.join(repoRoot, "appscreen-output", "_video-clips");
  await fs.mkdir(clipsDir, { recursive: true });
  const clipPaths: string[] = [];
  for (let i = 0; i < clipPlans.length; i++) {
    const plan = clipPlans[i];
    const clipOut = path.join(clipsDir, `clip-${Date.now()}-${i}.mp4`);
    const t0 = Date.now();
    const result = await renderVideoConcept({
      image: plan.image,
      output_path: clipOut,
      fps: style.fps,
      format: "mp4",
      language: "en",
      output_device: cli.device || "iphone-6.9",
      concept: plan.concept,
    });
    clipPaths.push(clipOut);
    console.log(
      `[video] clip ${i + 1}/${clipPlans.length} • ${plan.label} • ${result.total_duration_seconds.toFixed(1)}s • ${result.total_frames}f • ${(Date.now() - t0)}ms`
    );
  }

  console.log(`[video] concat ${clipPaths.length} clip(s) with ${xfadeSec}s xfade`);
  await concatWithXfade(clipPaths, cli.out, xfadeSec);

  // Cleanup temp clips.
  for (const c of clipPaths) await fs.unlink(c).catch(() => {});

  await shutdownBrowser();
  console.log(`[video] done → ${cli.out}`);
}

main().catch(async (err) => {
  console.error(err);
  await shutdownBrowser().catch(() => {});
  process.exit(1);
});
