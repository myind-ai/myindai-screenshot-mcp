// Concept-driven (storyboard) video model.
//
// A Concept is an ordered list of Acts. Each Act has:
//   - duration (seconds)
//   - motion: keyframes (same shape as the existing scenes module — t in 0..1 within the act)
//   - text:   { headline?, subheadline?, in, hold, out }   — text fade timeline DECOUPLED from motion
//   - transition (to the NEXT act): "cut" | "crossfade-300ms" etc.
//
// Render flow:
//   total time = sum of act durations
//   for each frame at global time T:
//     find which act, compute local t (0..1), sample motion + text alpha
//     emit one frame
//
// This decouples motion from text, supports multi-act stories, and gives the AI a
// real storyboard to author rather than picking from 5 fixed scenes.

import { sampleAt, type Keyframe } from "./scenes.js";

export type TransitionKind = "cut" | "crossfade";

export interface ActText {
  headline?: string;
  subheadline?: string;
  // Fade timing within the act, all in 0..1 of the act's duration.
  fade_in?: number;   // alpha 0 -> 1 between t=0 and t=fade_in (default 0.15)
  hold?: number;      // alpha 1 from t=fade_in to t=fade_in+hold (default fills the rest)
  fade_out?: number;  // alpha 1 -> 0 in the last fade_out portion (default 0)
}

export interface ConceptAct {
  name?: string;
  duration: number;            // seconds
  motion: Keyframe[];          // [{t: 0..1, decision}]
  text?: ActText;
  // Transition affecting the JOIN to the next act (last act's transition is ignored).
  transition?: { kind: TransitionKind; duration?: number /* seconds */ };
}

export interface Concept {
  base?: Record<string, any>;  // baseline decision applied to every act (e.g. fonts, gradient).
  acts: ConceptAct[];
}

export interface ResolvedFrame {
  // The merged decision to apply this frame (after motion sampling + text alpha multipliers + crossfade).
  decision: Record<string, any>;
}

// Convert the concept into a flat frame plan: one decision per frame, ready for the renderer.
export function planFrames(concept: Concept, fps: number): ResolvedFrame[] {
  if (!concept.acts.length) throw new Error("Concept has no acts");
  const frames: ResolvedFrame[] = [];

  // Per-act start time + duration (seconds).
  const acts = concept.acts.map((a) => ({ ...a, duration: Math.max(0.05, a.duration) }));
  const starts: number[] = [];
  let acc = 0;
  for (const a of acts) {
    starts.push(acc);
    acc += a.duration;
  }
  const total = acc;
  const totalFrames = Math.max(2, Math.round(total * fps));

  for (let i = 0; i < totalFrames; i++) {
    const T = (i / (totalFrames - 1)) * total;

    // Locate the active act (and possibly the next one if we're inside a crossfade).
    let actIdx = 0;
    for (let k = 0; k < acts.length; k++) {
      if (T >= starts[k] && T < starts[k] + acts[k].duration) { actIdx = k; break; }
      if (k === acts.length - 1 && T >= starts[k]) actIdx = k;
    }

    const a = acts[actIdx];
    const localT = (T - starts[actIdx]) / a.duration;

    // Sample motion within this act's keyframes.
    const motion = sampleAt(a.motion, localT, "ease-in-out");

    // Text alpha based on the act's fade_in / hold / fade_out timing.
    const ta = computeTextAlpha(a.text, localT);

    // Apply the act's text content + alpha multipliers onto the motion decision.
    const merged = applyConceptText(deepClone(motion), a.text, ta, concept.base);

    // Crossfade to next act's motion + text (linear blend on numeric fields, snap on non-numeric).
    if (a.transition?.kind === "crossfade" && actIdx + 1 < acts.length) {
      const xfDur = Math.max(0.05, Math.min(a.duration, a.transition.duration ?? 0.4));
      const xfStart = starts[actIdx] + a.duration - xfDur;
      if (T >= xfStart) {
        const next = acts[actIdx + 1];
        const nextLocalT = 0; // crossfade always blends from beginning of next act
        const nextMotion = sampleAt(next.motion, nextLocalT, "ease-in-out");
        const nextTa = computeTextAlpha(next.text, nextLocalT);
        const nextMerged = applyConceptText(deepClone(nextMotion), next.text, nextTa, concept.base);

        const xfT = Math.min(1, (T - xfStart) / xfDur);
        const k = easeInOut(xfT);
        const blended = lerpDecision(merged, nextMerged, k);
        frames.push({ decision: blended });
        continue;
      }
    }

    frames.push({ decision: merged });
  }

  return frames;
}

function computeTextAlpha(text: ActText | undefined, localT: number) {
  if (!text) return { headline: 1, subheadline: 1 };
  const fadeIn = clamp(text.fade_in ?? 0.15, 0, 1);
  const fadeOut = clamp(text.fade_out ?? 0, 0, 1);
  // Hold occupies whatever's between fade_in end and fade_out start.
  const fadeOutStart = 1 - fadeOut;

  let alpha = 1;
  if (localT < fadeIn) alpha = easeInOut(localT / Math.max(0.001, fadeIn));
  else if (localT > fadeOutStart) alpha = 1 - easeInOut((localT - fadeOutStart) / Math.max(0.001, fadeOut));
  // else: holding (alpha = 1)

  alpha = clamp(alpha, 0, 1);
  return { headline: alpha, subheadline: alpha };
}

function applyConceptText(
  decision: Record<string, any>,
  text: ActText | undefined,
  alpha: { headline: number; subheadline: number },
  base?: Record<string, any>
) {
  // Start with concept-level base, overlay scene's decision, overlay act's text content.
  const merged = mergeDeep(deepClone(base || {}), decision);
  if (!merged.text) merged.text = {};
  // Set act-specific headline/subheadline strings (only if provided — empty string disables).
  if (text?.headline !== undefined) merged.text.headline = text.headline;
  if (text?.subheadline !== undefined) merged.text.subheadline = text.subheadline;
  // Apply alpha multipliers.
  merged.text.headlineAlphaMul = alpha.headline;
  merged.text.subheadlineAlphaMul = alpha.subheadline;
  return merged;
}

// ----- helpers -------------------------------------------------------------

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function deepClone<T>(v: T): T {
  if (v == null || typeof v !== "object") return v;
  return JSON.parse(JSON.stringify(v));
}

function mergeDeep(a: Record<string, any>, b: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { ...a };
  for (const k of Object.keys(b)) {
    const av = a[k];
    const bv = b[k];
    if (av && bv && typeof av === "object" && typeof bv === "object" && !Array.isArray(av) && !Array.isArray(bv)) {
      out[k] = mergeDeep(av, bv);
    } else {
      out[k] = bv;
    }
  }
  return out;
}

// Linear blend used during crossfades. For numbers, true lerp; for strings/booleans, snap at midpoint.
function lerpDecision(a: any, b: any, k: number): any {
  if (typeof a === "number" && typeof b === "number") return a + (b - a) * k;
  if (Array.isArray(a) && Array.isArray(b)) {
    const out: any[] = [];
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) out[i] = lerpDecision(a[i], b[i], k);
    return out;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const out: Record<string, any> = { ...a };
    for (const key of Object.keys(b)) {
      if (key in a) out[key] = lerpDecision(a[key], b[key], k);
      else out[key] = deepClone(b[key]);
    }
    return out;
  }
  return k < 0.5 ? deepClone(a) : deepClone(b);
}
