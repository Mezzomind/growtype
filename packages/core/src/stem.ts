import {
  type Point,
  add,
  cubicAt,
  cubicTangent,
  fmt,
  leftNormal,
  normalize,
  rotate,
  scale,
  smoothPath,
  sub,
} from "./geometry.ts";

export interface StemParams {
  /** Base point on the path. */
  base: Point;
  /** Unit normal of the path at the base (direction of growth). */
  normal: Point;
  /** Unit tangent of the path at the base. */
  tangent: Point;
  /** Where the stem meets the glyph. */
  tip: Point;
  /** Unit direction the glyph's "up" points in. */
  tipDir: Point;
  thickness: number;
  flare: number;
  wobble: number;
  /** 0–1 wilt intensity: thins the stem and adds kinks. */
  wilt: number;
  rhizoids: number;
  rand: () => number;
}

export interface StemGeometry {
  /** Closed, filled outline of the stem including its flared base. */
  outline: string;
  /** The stem's centreline (used to mask the grow animation). */
  centerline: string;
  /** Hair-like root filaments around the base (stroked). */
  rhizoids: Array<{ d: string; width: number }>;
  /** Maximum half-width of the stem, for sizing masks. */
  maxHalfWidth: number;
}

interface Wave {
  amp: number;
  freq: number;
  phase: number;
}

function waves(rand: () => number, count: number, minF: number, maxF: number): Wave[] {
  return Array.from({ length: count }, () => ({
    amp: 0.5 + rand() * 0.5,
    freq: minF + rand() * (maxF - minF),
    phase: rand() * Math.PI * 2,
  }));
}

function sampleWaves(ws: Wave[], t: number): number {
  let v = 0;
  let norm = 0;
  for (const w of ws) {
    v += w.amp * Math.sin(w.freq * t * Math.PI * 2 + w.phase);
    norm += w.amp;
  }
  return norm ? v / norm : 0;
}

/**
 * Build a wobbly, organic mould-spore stalk: a filament rising from a splayed,
 * blobby foot on the path to a small swelling (vesicle) under the glyph.
 */
export function buildStem(p: StemParams): StemGeometry {
  const { base, normal, tip, tipDir, rand } = p;
  const span = Math.hypot(tip.x - base.x, tip.y - base.y);
  const half = p.thickness / 2;

  // Centreline: leave the path along its normal, arrive at the glyph along tipDir.
  const c1 = add(base, scale(normal, span * 0.42));
  const c2 = sub(tip, scale(tipDir, span * 0.38));

  const bend = waves(rand, 3, 0.6, 1.8);
  const kinks = waves(rand, 3, 3, 6);
  const widthNoise = waves(rand, 3, 1.5, 4);
  const bendAmp = p.wobble * Math.min(span * 0.12, p.thickness * 2.2);
  const kinkAmp = p.wilt * p.thickness * 0.9;
  const thin = 1 - 0.3 * p.wilt;
  const footLen = 0.08 + 0.06 * rand();
  const knob = 0.35 + 0.35 * rand();

  const N = Math.max(14, Math.min(40, Math.round(span / 2.5)));
  const left: Point[] = [];
  const right: Point[] = [];
  const centre: Point[] = [];
  let maxHalf = 0;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const pt = cubicAt(base, c1, c2, tip, t);
    const tan = normalize(cubicTangent(base, c1, c2, tip, t));
    // Perpendicular: on the left of travel (stems travel away from the path).
    const perp = leftNormal(tan);
    const env = Math.sin(Math.PI * t);
    const offset = bendAmp * env * sampleWaves(bend, t) + kinkAmp * env * sampleWaves(kinks, t);
    const c = add(pt, scale(perp, offset));
    const taper = 1 - 0.3 * t;
    const foot = p.flare * Math.exp(-t / footLen);
    const vesicle = knob * Math.exp(-(1 - t) / 0.07);
    const jitter = 1 + 0.18 * p.wobble * sampleWaves(widthNoise, t);
    const w = Math.max(0.25, half * thin * (taper * jitter + foot + vesicle));
    maxHalf = Math.max(maxHalf, w);
    centre.push(c);
    left.push(add(c, scale(perp, w)));
    right.push(sub(c, scale(perp, w)));
  }

  // Round cap over the tip (it's buried in the glyph, but keeps the shape clean).
  const tipTan = normalize(cubicTangent(base, c1, c2, tip, 1));
  const capR = Math.hypot(left[N]!.x - right[N]!.x, left[N]!.y - right[N]!.y) / 2;
  const cap = add(centre[N]!, scale(tipTan, capR));

  // Blobby foot that bulges slightly below the path line.
  const bulge = add(base, scale(normal, -half * (0.6 + 0.6 * rand())));

  const ring = [...right, cap, ...left.reverse(), bulge];
  const outline = smoothPath(ring, true, 0.9);

  const centerline =
    `M${fmt(base.x - normal.x * half * 2)} ${fmt(base.y - normal.y * half * 2)}` +
    `L${fmt(base.x)} ${fmt(base.y)}` +
    `C${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(tip.x)} ${fmt(tip.y)}`;

  // Rhizoids: thin hairs creeping out along the path from the foot.
  const rhizoids: StemGeometry["rhizoids"] = [];
  const count = Math.max(0, Math.round(p.rhizoids + (rand() - 0.5) * 1.5));
  for (let i = 0; i < count; i++) {
    const dir = rand() < 0.5 ? -1 : 1;
    const reach = half * (2 + p.flare * (1.2 + rand() * 1.6));
    // Start inside the foot, splay sideways and slightly down/up.
    const startPt = add(base, scale(p.tangent, dir * half * p.flare * (0.3 + rand() * 0.4)));
    const ang = dir * (60 + rand() * 50); // degrees from the normal
    const dirVec = rotate(normal, ang);
    const mid = add(startPt, scale(rotate(dirVec, (rand() - 0.5) * 50), reach * 0.5));
    const end = add(startPt, scale(rotate(dirVec, (rand() - 0.5) * 30 + dir * 25), reach));
    rhizoids.push({
      d: smoothPath([startPt, mid, end]),
      width: Math.max(0.3, half * thin * (0.35 + rand() * 0.3)),
    });
  }

  return { outline, centerline, rhizoids, maxHalfWidth: maxHalf };
}
