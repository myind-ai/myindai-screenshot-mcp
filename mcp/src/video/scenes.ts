// Built-in animation scenes. Each returns a sorted list of keyframes:
//   keyframe = { t: 0..1, decision: <render_screenshot decision delta> }
// The video pipeline interpolates linearly between keyframes for numeric values
// (with optional ease-in-out), and uses last-set value for non-numeric ones.

export interface Keyframe {
  t: number;
  decision: Record<string, any>;
}

export type SceneName = "tilt-in" | "rotate-360" | "float" | "fade-in" | "zoom-in";

export interface SceneOptions {
  intensity?: number; // 0..1, scene-dependent. Default 0.7.
  loop?: boolean;
}

export function buildScene(
  name: SceneName,
  baseDecision: Record<string, any>,
  opts: SceneOptions = {}
): Keyframe[] {
  const intensity = clamp(opts.intensity ?? 0.7, 0.1, 1.5);

  switch (name) {
    case "tilt-in":
      return tiltIn(baseDecision, intensity);
    case "rotate-360":
      return rotate360(baseDecision);
    case "float":
      return floatLoop(baseDecision, intensity);
    case "fade-in":
      return fadeIn(baseDecision);
    case "zoom-in":
      return zoomIn(baseDecision, intensity);
    default:
      throw new Error(`Unknown scene: ${name}`);
  }
}

// ----- scene definitions ---------------------------------------------------

function tiltIn(base: Record<string, any>, intensity: number): Keyframe[] {
  // Phone enters slightly off-axis and "lands" into a three-quarter view.
  // Headline fades in halfway through.
  const yEnd = -10 * intensity;
  const yMidStart = 35 * intensity;
  return [
    {
      t: 0,
      decision: {
        ...base,
        mode: "3d",
        screenshot: {
          ...(base.screenshot || {}),
          scale: 60,
          y: 60,
          rotation3D: { x: 0, y: yMidStart, z: 0 },
          shadow: { ...(base.screenshot?.shadow || {}), opacity: 30, blur: 70, y: 20 },
        },
        text: { ...(base.text || {}), subheadlineOpacity: 0, headlineSize: 90 },
      },
    },
    {
      t: 0.6,
      decision: {
        ...base,
        mode: "3d",
        screenshot: {
          ...(base.screenshot || {}),
          scale: 76,
          y: 50,
          rotation3D: { x: -8 * intensity, y: yEnd + 25, z: 0 },
          shadow: { ...(base.screenshot?.shadow || {}), opacity: 45, blur: 100, y: 35 },
        },
        text: { ...(base.text || {}), subheadlineOpacity: 40, headlineSize: 110 },
      },
    },
    {
      t: 1.0,
      decision: {
        ...base,
        mode: "3d",
        screenshot: {
          ...(base.screenshot || {}),
          scale: 78,
          y: 50,
          rotation3D: { x: -8 * intensity, y: yEnd + 18, z: 0 },
          shadow: { ...(base.screenshot?.shadow || {}), opacity: 50, blur: 110, y: 40 },
        },
        text: { ...(base.text || {}), subheadlineOpacity: 75, headlineSize: 110 },
      },
    },
  ];
}

function rotate360(base: Record<string, any>): Keyframe[] {
  // Full 360° spin around Y axis. Headline static.
  return [
    { t: 0,    decision: deep3D(base, { x: -5, y: -180, z: 0 }) },
    { t: 0.25, decision: deep3D(base, { x: -5, y:  -90, z: 0 }) },
    { t: 0.5,  decision: deep3D(base, { x: -5, y:    0, z: 0 }) },
    { t: 0.75, decision: deep3D(base, { x: -5, y:   90, z: 0 }) },
    { t: 1.0,  decision: deep3D(base, { x: -5, y:  180, z: 0 }) },
  ];
}

function floatLoop(base: Record<string, any>, intensity: number): Keyframe[] {
  // Gentle 3-axis sway. Loops cleanly: t=0 == t=1.
  const a = 6 * intensity;
  const b = 10 * intensity;
  return [
    { t: 0.0, decision: deep3D(base, { x: -a, y:  b, z: 0 }) },
    { t: 0.25, decision: deep3D(base, { x: -a*0.3, y:  b*1.1, z: a*0.2 }) },
    { t: 0.5, decision: deep3D(base, { x:  a*0.4, y:  b*0.6, z: 0 }) },
    { t: 0.75, decision: deep3D(base, { x:  a*0.2, y:  b*0.9, z: -a*0.2 }) },
    { t: 1.0, decision: deep3D(base, { x: -a, y:  b, z: 0 }) },
  ];
}

function fadeIn(base: Record<string, any>): Keyframe[] {
  // No 3D rotation — pure scale + headline fade-in. Works in 2D too.
  return [
    {
      t: 0,
      decision: {
        ...base,
        screenshot: { ...(base.screenshot || {}), scale: 70 },
        text: { ...(base.text || {}), subheadlineOpacity: 0, headlineSize: 80 },
      },
    },
    {
      t: 0.5,
      decision: {
        ...base,
        screenshot: { ...(base.screenshot || {}), scale: 75 },
        text: { ...(base.text || {}), subheadlineOpacity: 40, headlineSize: 100 },
      },
    },
    {
      t: 1.0,
      decision: {
        ...base,
        screenshot: { ...(base.screenshot || {}), scale: 78 },
        text: { ...(base.text || {}), subheadlineOpacity: 75, headlineSize: 110 },
      },
    },
  ];
}

function zoomIn(base: Record<string, any>, intensity: number): Keyframe[] {
  // Phone scales from small to full hero size. 2D friendly.
  const startScale = Math.max(40, 70 - 30 * intensity);
  return [
    { t: 0, decision: { ...base, screenshot: { ...(base.screenshot || {}), scale: startScale } } },
    { t: 1, decision: { ...base, screenshot: { ...(base.screenshot || {}), scale: 78 } } },
  ];
}

// ----- helpers -------------------------------------------------------------

function deep3D(base: Record<string, any>, rotation: { x: number; y: number; z: number }) {
  return {
    ...base,
    mode: "3d",
    screenshot: {
      ...(base.screenshot || {}),
      rotation3D: rotation,
    },
  };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

// Sample a value at time t (0..1) by interpolating between keyframes.
export function sampleAt(
  frames: Keyframe[],
  t: number,
  ease: "linear" | "ease-in-out" = "ease-in-out"
): Record<string, any> {
  if (frames.length === 0) return {};
  if (t <= frames[0].t) return clone(frames[0].decision);
  if (t >= frames[frames.length - 1].t) return clone(frames[frames.length - 1].decision);

  let i = 0;
  while (i < frames.length - 1 && t > frames[i + 1].t) i++;
  const a = frames[i];
  const b = frames[i + 1];
  const span = b.t - a.t;
  const localT = span === 0 ? 0 : (t - a.t) / span;
  const k = ease === "ease-in-out" ? easeInOut(localT) : localT;

  return interp(a.decision, b.decision, k);
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function interp(a: any, b: any, k: number): any {
  if (typeof a === "number" && typeof b === "number") return a + (b - a) * k;
  if (Array.isArray(a) && Array.isArray(b)) {
    const out: any[] = [];
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) out[i] = interp(a[i], b[i], k);
    return out;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const out: Record<string, any> = { ...a };
    for (const key of Object.keys(b)) {
      if (key in a) out[key] = interp(a[key], b[key], k);
      else out[key] = clone(b[key]);
    }
    return out;
  }
  // Non-numeric: snap to b past midpoint.
  return k < 0.5 ? clone(a) : clone(b);
}

function clone<T>(v: T): T {
  if (v == null || typeof v !== "object") return v;
  return JSON.parse(JSON.stringify(v));
}
