/**
 * Video templates loaded from `mcp/video_script/*.json`.
 *
 * This is the canonical home of the spec compiler used by both:
 *   - the CLI script `mcp/scripts/video.ts`
 *   - the MCP tools `list_video_templates` / `render_video_template`
 *
 * Each spec JSON describes a multi-scene storyboard (canvas + screens + scenes).
 * `compileSpec` turns it into renderer ClipPlans by sampling each scene's
 * animations into renderer keyframes. See the SPEC COMPILER doc-block below
 * for property mappings and the list of spec features that are intentionally
 * dropped because the headless canvas renderer can't realise them.
 */

import path from "node:path";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Concept } from "./concept.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Location of the JSON storyboards. Resolved relative to this file so it works
// in both the dev layout (mcp/src/video/templates.ts → mcp/video_script/) and
// the published-package layout (dist/video/templates.js → ../video_script/).
const CANDIDATES = [
  path.resolve(__dirname, "..", "..", "video_script"),  // dev: src/video/ → mcp/video_script/
  path.resolve(__dirname, "..", "video_script"),         // published: dist/ → pkg/video_script/
];
function findScriptDir(): string | null {
  for (const c of CANDIDATES) if (existsSync(c)) return c;
  return null;
}
const VIDEO_SCRIPT_DIR = findScriptDir();

// ─── Public types ───────────────────────────────────────────────────────────
export type Decision = Record<string, any>;

export interface ClipPlan {
  image: string;
  concept: Concept;
  label: string;
}

export interface TemplateCtx {
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

export interface BuildResult {
  clips: ClipPlan[];
  base: Decision;
  xfadeSec: number;
}

export type TemplateBuilder = (ctx: TemplateCtx) => BuildResult;

export interface TemplateMetadata {
  slug: string;
  name: string;          // human-readable name (from spec _name)
  style: string;         // one-line description (from spec _style)
  scenes: number;        // scene count
  total_seconds: number; // sum of scene durations
  ideal_screens: number; // distinct screen ids the spec uses (≈ best #shots)
  fps: number;           // spec's recommended fps
  source: "spec";
}

// ════════════════════════════════════════════════════════════════════════════
// SPEC COMPILER  ─  generic JSON-storyboard → ClipPlan[]
// ════════════════════════════════════════════════════════════════════════════
// Element types we honor:
//   - "mockup"  (motion + screen reference)
//   - "text"    (headline + fade timing)
// Element types we ignore:
//   - "image"      → no overlay layer in renderer (logo SVGs)
//   - "shape"      → no shape primitives
//   - "particles"  → no particle system
//   - "lottie"     → no AE/Lottie playback
// Multi-mockup scenes (instance_id="phone_left|center|right") are degraded to a
// single solo phone using the FIRST mockup's animations.
//
// Property mappings (spec → renderer):
//   position{x,y}             → screenshot.{x,y}
//   scale (1.0 = natural)     → screenshot.scale = round(s * 78)
//   rotation (z)              → screenshot.rotation
//   tilt3d{rotateX,rotateY,Z} → screenshot.rotation3D{x,y,z}
//   opacity 0→1 (entrance)    → approximate via early scale ramp from 15→target
//   opacity (mid-scene fade)  → ignored (renderer has no per-screenshot alpha)
//   blur                      → ignored
//   screenshot{action}        → marks scene as new clip boundary (image swap)
// Easing collapses to ease-in-out (renderer's only easing).

interface SpecAnim {
  property: string;
  from?: any;
  to?: any;
  delay: number;
  duration: number;
  easing?: string;
  action?: string;
  direction?: string;
  from_screen?: string;
  to_screen?: string;
}
interface SpecElement {
  type: string;
  screen?: string;
  instance_id?: string;
  content?: string;
  font?: string;
  font_size?: number;
  font_weight?: number;
  color?: string;
  position?: { x: number; y: number };
  animations?: SpecAnim[];
}
interface SpecScene {
  id: string;
  label?: string;
  start: number;
  duration: number;
  elements: SpecElement[];
}
interface VideoSpec {
  _name?: string;
  _style?: string;
  canvas?: { fps?: number; duration?: number; width?: number; height?: number };
  screens?: { id: string; src?: string; label?: string }[];
  background?: any;
  scenes: SpecScene[];
}

// ── easing + lerp ────────────────────────────────────────────────────────────
function easeInOut(k: number): number {
  if (k <= 0) return 0;
  if (k >= 1) return 1;
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}
function clampNum(v: any, min: number, max: number): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return Math.max(min, Math.min(max, v));
}
function lerpAny(a: any, b: any, k: number): any {
  if (typeof a === "number" && typeof b === "number") return a + (b - a) * k;
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a)) {
    const out: any = {};
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) out[key] = lerpAny(a[key], b[key], k);
    return out;
  }
  return k < 0.5 ? a : b;
}

function evalProperty(animations: SpecAnim[], propName: string, t: number): any {
  const propAnims = animations.filter((a) => a.property === propName);
  if (propAnims.length === 0) return undefined;
  propAnims.sort((a, b) => a.delay - b.delay);
  let active: SpecAnim | null = null;
  let lastEnded: SpecAnim | null = null;
  for (const a of propAnims) {
    const start = a.delay;
    const end = a.delay + a.duration;
    if (t >= start && t <= end) {
      if (!active || a.delay > active.delay) active = a;
    } else if (t > end) {
      if (!lastEnded || a.delay > lastEnded.delay) lastEnded = a;
    }
  }
  if (active) {
    const k = active.duration > 0 ? (t - active.delay) / active.duration : 1;
    return lerpAny(active.from, active.to, easeInOut(Math.max(0, Math.min(1, k))));
  }
  if (lastEnded) return lastEnded.to;
  return propAnims[0].from;
}

function sampleScreenshotState(animations: SpecAnim[] | undefined, t: number): Decision {
  const out: any = {};
  if (!animations) return out;
  const pos = evalProperty(animations, "position", t);
  if (pos && typeof pos === "object") {
    const x = clampNum(pos.x, -50, 150);
    const y = clampNum(pos.y, -50, 150);
    if (x !== undefined) out.x = x;
    if (y !== undefined) out.y = y;
  }
  const scale = evalProperty(animations, "scale", t);
  if (typeof scale === "number") out.scale = clampNum(Math.round(scale * 78), 15, 150);
  const rot = evalProperty(animations, "rotation", t);
  if (typeof rot === "number") out.rotation = clampNum(rot, -180, 180);
  const tilt = evalProperty(animations, "tilt3d", t);
  if (tilt && typeof tilt === "object") {
    out.rotation3D = {
      x: clampNum(tilt.rotateX || 0, -45, 45) ?? 0,
      y: clampNum(tilt.rotateY || 0, -180, 180) ?? 0,
      z: clampNum(tilt.rotateZ || 0, -45, 45) ?? 0,
    };
  }
  const opacity = evalProperty(animations, "opacity", t);
  if (typeof opacity === "number" && opacity < 1 && out.scale === undefined) {
    out.scale = clampNum(Math.round(opacity * 78), 15, 150);
  }
  return out;
}

function clipWords(s: string, maxWords: number) {
  return s.split(/\s+/).filter(Boolean).slice(0, maxWords).join(" ");
}

function deriveTextFromElements(
  elements: SpecElement[],
  duration: number,
  ctx: TemplateCtx,
  sceneIndex: number,
  fallbackHeadline: string
): { headline: string; subheadline: string; fade_in: number; hold: number; fade_out: number } | undefined {
  const textEls = elements.filter((e) => e.type === "text" && (e.content || ctx.headlines[sceneIndex]));
  if (textEls.length === 0 && !ctx.headlines[sceneIndex]) return undefined;
  const primary = textEls[0];
  const overrideHeadline = ctx.headlines[sceneIndex];
  const overrideSub = ctx.subheadlines[sceneIndex];
  const headlineSrc = overrideHeadline || primary?.content || fallbackHeadline;

  let fadeIn = 0.30;
  let fadeOut = 0.05;
  for (const a of primary?.animations || []) {
    if (a.property !== "opacity") continue;
    if (a.from === 0 && a.to === 1) {
      fadeIn = Math.min(0.85, Math.max(0.05, (a.delay + a.duration) / duration));
    }
    if (a.from === 1 && a.to === 0) {
      fadeOut = Math.min(0.6, Math.max(0, (duration - a.delay) / duration));
    }
  }
  if (fadeIn + fadeOut > 0.95) fadeOut = Math.max(0, 0.95 - fadeIn);
  const hold = Math.max(0, 1 - fadeIn - fadeOut);
  return {
    headline: clipWords(headlineSrc, 4),
    subheadline: clipWords(overrideSub || "", 8),
    fade_in: fadeIn,
    hold,
    fade_out: fadeOut,
  };
}

function isLight(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff,
    g = (n >> 8) & 0xff,
    b = n & 0xff;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55;
}

function buildBaseFromSpec(spec: VideoSpec, ctx: TemplateCtx): Decision {
  const bg = spec.background || {};
  const base: any = {
    mode: ctx.mode,
    background: { noise: true, noiseIntensity: 4 },
    screenshot: {
      device3D: ctx.device3D,
      shadow: { enabled: true, color: "#000000", blur: 60, opacity: 30, x: 0, y: 28 },
      glow: { enabled: true, color: "#ffffff", intensity: 35, size: 90 },
    },
  };

  if (bg.type === "solid" && typeof bg.color === "string") {
    base.background.type = "solid";
    base.background.solid = bg.color;
    base.textColor = isLight(bg.color) ? "dark" : "light";
  } else if (bg.type === "gradient" && Array.isArray(bg.stops) && bg.stops.length >= 2) {
    base.background.type = "gradient";
    base.background.gradient = {
      angle: clampNum(bg.angle, 0, 360) ?? 135,
      stops: bg.stops
        .filter((s: any) => typeof s.color === "string")
        .slice(0, 5)
        .map((s: any) => ({ color: s.color, position: clampNum(s.position, 0, 100) ?? 50 })),
    };
    base.textColor = isLight(bg.stops[0].color) ? "dark" : "light";
  } else if (bg.type === "mesh_gradient" && Array.isArray(bg.colors) && bg.colors.length >= 2) {
    base.background.type = "gradient";
    base.background.gradient = {
      angle: 135,
      stops: bg.colors.slice(0, 4).map((c: string, i: number) => ({
        color: c,
        position: Math.round((i * 100) / Math.max(1, Math.min(3, bg.colors.length - 1))),
      })),
    };
    base.textColor = isLight(bg.colors[0]) ? "dark" : "light";
  } else {
    base.background.type = "gradient";
    base.background.gradient = {
      angle: 135,
      stops: [
        { color: "#0a0a0f", position: 0 },
        { color: "#1a1033", position: 100 },
      ],
    };
    base.textColor = "light";
  }

  if (ctx.gradientOverride) {
    base.backgroundPreset = ctx.gradientOverride;
    delete base.background.type;
    delete base.background.gradient;
    delete base.background.solid;
  }
  base.accentColor = ctx.accentOverride || (base.textColor === "light" ? "#7c8df0" : "#1d1d1f");
  base.screenshot.glow.color = base.accentColor;
  base.screenshot.shadow.opacity = base.textColor === "dark" ? 18 : 32;

  const firstFont =
    spec.scenes
      ?.flatMap((s) => s.elements || [])
      .find((e) => e.type === "text" && typeof e.font === "string")?.font || "Inter";
  const font = ctx.fontOverride || (firstFont.startsWith("SF Pro") ? "Inter" : firstFont);
  base.text = {
    font,
    headlineFont: font,
    subheadlineFont: font,
    headlineWeight: "700",
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
    subheadlineOpacity: base.textColor === "dark" ? 60 : 70,
  };
  return base;
}

function findPrimaryMockupScreen(scene: SpecScene): string | undefined {
  const mockup = (scene.elements || []).find((e) => e.type === "mockup" && typeof e.screen === "string");
  return mockup?.screen;
}
function resolveShot(screenId: string | undefined, spec: VideoSpec, ctx: TemplateCtx): string {
  if (!screenId || !spec.screens || ctx.shots.length === 0) return ctx.shots[0];
  const idx = spec.screens.findIndex((s) => s.id === screenId);
  if (idx < 0) return ctx.shots[0];
  return ctx.shots[idx % ctx.shots.length];
}

function compileSceneToAct(
  scene: SpecScene,
  sceneIndex: number,
  ctx: TemplateCtx,
  transitionKind: "cut" | "crossfade",
  fallbackHeadline: string
): Concept["acts"][number] {
  const dur = Math.max(0.3, scene.duration);
  const primary = (scene.elements || []).find((e) => e.type === "mockup" && Array.isArray(e.animations));
  const animations = primary?.animations || [];
  const markers = new Set<number>([0, dur]);
  for (const a of animations) {
    if (a.property === "screenshot") continue;
    markers.add(Math.max(0, Math.min(dur, a.delay)));
    markers.add(Math.max(0, Math.min(dur, a.delay + a.duration)));
  }
  const times = Array.from(markers).sort((x, y) => x - y);
  const motion = times.map((t) => ({
    t: dur > 0 ? t / dur : 0,
    decision: { screenshot: sampleScreenshotState(animations, t) } as Decision,
  }));
  if (motion.length === 0) motion.push({ t: 0, decision: {} });
  const text = deriveTextFromElements(scene.elements || [], dur, ctx, sceneIndex, fallbackHeadline);
  return {
    name: scene.id || `scene_${sceneIndex + 1}`,
    duration: dur,
    motion,
    ...(text ? { text } : {}),
    transition: transitionKind === "crossfade" ? { kind: "crossfade", duration: 0.4 } : { kind: "cut" },
  };
}

export function compileSpec(spec: VideoSpec, ctx: TemplateCtx, slug: string): BuildResult {
  const base = buildBaseFromSpec(spec, ctx);
  const clips: ClipPlan[] = [];
  let currentImage: string | null = null;
  let currentActs: Concept["acts"] = [];
  let clipIdx = 0;

  const scenes = spec.scenes || [];
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const primaryScreen = findPrimaryMockupScreen(scene);
    const imagePath = resolveShot(primaryScreen, spec, ctx);
    const isLast = i === scenes.length - 1;
    const nextScreen = isLast ? null : findPrimaryMockupScreen(scenes[i + 1]);
    const nextImage = nextScreen ? resolveShot(nextScreen, spec, ctx) : null;

    if (currentImage !== null && currentImage !== imagePath) {
      clips.push({
        image: currentImage,
        label: `${slug}-clip-${++clipIdx}`,
        concept: { base, acts: currentActs },
      });
      currentActs = [];
    }
    currentImage = imagePath;

    const screenChangesAfter = !isLast && nextImage !== imagePath;
    const transitionKind: "cut" | "crossfade" = screenChangesAfter || isLast ? "cut" : "crossfade";
    currentActs.push(
      compileSceneToAct(scene, i, ctx, transitionKind, ctx.appName ? clipWords(ctx.appName, 4) : "Beautiful, fast, simple")
    );
  }

  if (currentImage !== null) {
    clips.push({
      image: currentImage,
      label: `${slug}-clip-${++clipIdx}`,
      concept: { base, acts: currentActs },
    });
  }
  return { clips, base, xfadeSec: 0.35 };
}

// ─── Template registry ──────────────────────────────────────────────────────
function readSpec(slug: string): VideoSpec | null {
  if (!VIDEO_SCRIPT_DIR) return null;
  const files = readdirSync(VIDEO_SCRIPT_DIR);
  const match = files.find((f) => f.endsWith(".json") && f.replace(/^\d+[-_]/, "").replace(/\.json$/, "") === slug);
  if (!match) return null;
  return JSON.parse(readFileSync(path.join(VIDEO_SCRIPT_DIR, match), "utf8")) as VideoSpec;
}

export function templateExists(slug: string): boolean {
  if (!VIDEO_SCRIPT_DIR) return false;
  const files = readdirSync(VIDEO_SCRIPT_DIR);
  return files.some((f) => f.endsWith(".json") && f.replace(/^\d+[-_]/, "").replace(/\.json$/, "") === slug);
}

export function buildTemplate(slug: string, ctx: TemplateCtx): BuildResult {
  const spec = readSpec(slug);
  if (!spec) throw new Error(`unknown template "${slug}"`);
  return compileSpec(spec, ctx, slug);
}

// ─── Listing / metadata ────────────────────────────────────────────────────
export function listVideoTemplates(): TemplateMetadata[] {
  if (!VIDEO_SCRIPT_DIR) return [];
  const files = readdirSync(VIDEO_SCRIPT_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  const out: TemplateMetadata[] = [];
  for (const f of files) {
    const slug = f.replace(/^\d+[-_]/, "").replace(/\.json$/, "");
    try {
      const spec = JSON.parse(readFileSync(path.join(VIDEO_SCRIPT_DIR, f), "utf8")) as VideoSpec;
      const totalSeconds = (spec.scenes || []).reduce((s, sc) => s + (sc.duration || 0), 0);
      const screenIds = new Set<string>();
      for (const sc of spec.scenes || []) {
        for (const el of sc.elements || []) {
          if (el.type === "mockup" && el.screen) screenIds.add(el.screen);
        }
      }
      out.push({
        slug,
        name: spec._name || slug,
        style: spec._style || "",
        scenes: (spec.scenes || []).length,
        total_seconds: Math.round(totalSeconds * 10) / 10,
        ideal_screens: screenIds.size || 1,
        fps: spec.canvas?.fps ?? 30,
        source: "spec",
      });
    } catch {
      // Skip malformed specs silently.
    }
  }
  return out;
}
