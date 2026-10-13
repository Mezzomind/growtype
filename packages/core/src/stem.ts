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
  /** 0–1+: how much each stalk's shape differs from the others. */
  variance: number;
  rand: () => number;
}

export interface StemGeometry {
  /**
   * Filled shapes: the stalk outline (including its flared foot) first, then any side branches
   * and spore heads. Kept as separate paths so overlaps never cancel out under the fill rule.
   */
  shapes: string[];
  /** The stem's centreline (used to mask the grow animation). */
  centerline: string;
  /** Hair-like root filaments around the base (stroked). */
  rhizoids: Array<{ d: string; width: number }>;
  /** Furthest any part of the stem strays from its centreline, for sizing masks. */
  maxHalfWidth: number;
  /** Per-stalk tone variation. */
  opacity: number;
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

/** Closed tapered filament along `pts`, plus a round spore head at the end (separate shapes). */
function filament(pts: Point[], rootHalf: number, tipHalf: number, head: number): string[] {
  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(pts.length - 1, i + 1)]!;
    const perp = leftNormal(normalize(sub(b, a)));
    const w = rootHalf + (tipHalf - rootHalf) * (i / (pts.length - 1));
    left.push(add(pts[i]!, scale(perp, w)));
    right.push(sub(pts[i]!, scale(perp, w)));
  }
  const shapes = [smoothPath([...right, ...left.reverse()], true, 0.9)];
  if (head > 0) {
    const c = pts[pts.length - 1]!;
    shapes.push(
      `M${fmt(c.x - head)} ${fmt(c.y)}a${fmt(head)} ${fmt(head)} 0 1 0 ${fmt(2 * head)} 0` +
        `a${fmt(head)} ${fmt(head)} 0 1 0 ${fmt(-2 * head)} 0Z`,
    );
  }
  return shapes;
}

/**
 * Build a wobbly, organic mould-spore stalk: a filament rising from a splayed,
 * blobby foot on the path to a small swelling (vesicle) under the glyph.
 *
 * Every stalk gets its own "personality" (scaled by `variance`): thickness, foot size and
 * asymmetry, taper, an overall C or S bow, nodal swellings, tip knob size and, now and then,
 * a side branch carrying a tiny spore head.
 */
export function buildStem(p: StemParams): StemGeometry {
  const { base, normal, tip, tipDir, rand } = p;
  const v = Math.max(0, p.variance);
  const spread = (amount: number) => 1 + v * amount * (rand() * 2 - 1);
  const span = Math.hypot(tip.x - base.x, tip.y - base.y);
  const half = (p.thickness / 2) * Math.max(0.35, spread(0.45));
  const flare = p.flare * Math.max(0.2, spread(0.55));

  // Centreline: leave the path along its normal, arrive at the glyph along tipDir.
  const c1 = add(base, scale(normal, span * (0.42 + v * (rand() - 0.5) * 0.3)));
  const c2 = sub(tip, scale(tipDir, span * (0.38 + v * (rand() - 0.5) * 0.3)));

  const bend = waves(rand, 3, 0.6, 1.8);
  const kinks = waves(rand, 3, 3, 6);
  const widthNoise = waves(rand, 3, 1.5, 4);
  const bendAmp = p.wobble * Math.min(span * 0.12, p.thickness * 2.2) * spread(0.6);
  const kinkAmp = p.wilt * p.thickness * 0.9;
  // Large-scale posture: a C-shaped bow or an S-curve, either way.
  const bowAmp = v * span * 0.14 * (rand() * 2 - 1);
  const sCurve = rand() < 0.35;
  const thin = 1 - 0.3 * p.wilt;
  const footLen = (0.08 + 0.06 * rand()) * spread(0.4);
  // Foot asymmetry: one side of the foot creeps further along the path.
  const asym = v * 0.6 * (rand() * 2 - 1);
  const knob = (0.25 + 0.5 * rand()) * spread(0.5);
  const taperEnd = 0.3 + v * (rand() - 0.5) * 0.4;
  const nodes = Array.from({ length: rand() < v ? 1 + Math.floor(rand() * 2.2) : 0 }, () => ({
    t: 0.25 + rand() * 0.55,
    amp: 0.25 + rand() * 0.55,
    w: 0.025 + rand() * 0.035,
  }));

  const N = Math.max(18, Math.min(56, Math.round(span / 2)));
  const left: Point[] = [];
  const right: Point[] = [];
  const centre: Point[] = [];
  const halfAt: number[] = [];
  let maxHalf = 0;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const pt = cubicAt(base, c1, c2, tip, t);
    const tan = normalize(cubicTangent(base, c1, c2, tip, t));
    // Perpendicular: on the left of travel (stems travel away from the path).
    const perp = leftNormal(tan);
    const env = Math.sin(Math.PI * t);
    const bow = bowAmp * (sCurve ? Math.sin(Math.PI * 2 * t) * 0.7 : env);
    const offset =
      bow + bendAmp * env * sampleWaves(bend, t) + kinkAmp * env * sampleWaves(kinks, t);
    const c = add(pt, scale(perp, offset));
    const taper = 1 - taperEnd * t;
    const foot = flare * Math.exp(-t / footLen);
    const vesicle = knob * Math.exp(-(1 - t) / 0.07);
    const node = nodes.reduce((acc, n) => acc + n.amp * Math.exp(-(((t - n.t) / n.w) ** 2)), 0);
    const jitter = 1 + 0.18 * p.wobble * sampleWaves(widthNoise, t);
    const w = Math.max(0.25, half * thin * (taper * jitter + foot + vesicle + node));
    // Skew the foot: widen one side, narrow the other, fading out up the stalk.
    const skew = asym * Math.exp(-t / (footLen * 1.6));
    maxHalf = Math.max(maxHalf, w * (1 + Math.abs(skew)));
    centre.push(c);
    halfAt.push(w);
    left.push(add(c, scale(perp, w * (1 + skew))));
    right.push(sub(c, scale(perp, w * (1 - skew))));
  }

  // Round cap over the tip (it's buried in the glyph, but keeps the shape clean).
  const tipTan = normalize(cubicTangent(base, c1, c2, tip, 1));
  const capR = Math.hypot(left[N]!.x - right[N]!.x, left[N]!.y - right[N]!.y) / 2;
  const cap = add(centre[N]!, scale(tipTan, capR));

  // Blobby foot that bulges slightly below the path line, nudged towards the longer side.
  const bulge = add(
    add(base, scale(normal, -half * (0.6 + 0.6 * rand()))),
    scale(p.tangent, -asym * half * flare * 0.5),
  );

  const ring = [...right, cap, ...left.reverse(), bulge];
  const shapes = [smoothPath(ring, true, 0.9)];

  // Occasional side branch: a thin hypha ending in a tiny spore head.
  let reach = 0;
  const branches = rand() < v * 0.4 ? (rand() < 0.25 ? 2 : 1) : 0;
  for (let b = 0; b < branches; b++) {
    const k = Math.round(N * (0.3 + rand() * 0.4));
    const at = centre[k]!;
    const a = centre[Math.max(0, k - 1)]!;
    const z = centre[Math.min(N, k + 1)]!;
    const dir = normalize(sub(z, a));
    const sideSign = rand() < 0.5 ? -1 : 1;
    const len = span * (0.12 + rand() * 0.16) * thin;
    const out = rotate(dir, sideSign * (30 + rand() * 30));
    const curl = rotate(out, -sideSign * (15 + rand() * 25));
    const pts = [
      at,
      add(at, scale(out, len * 0.35)),
      add(add(at, scale(out, len * 0.6)), scale(curl, len * 0.1)),
      add(add(at, scale(out, len * 0.7)), scale(curl, len * 0.3)),
    ];
    const rootHalf = Math.max(0.3, halfAt[k]! * 0.55);
    shapes.push(...filament(pts, rootHalf, rootHalf * 0.45, rootHalf * (1.3 + rand() * 1.2)));
    reach = Math.max(reach, len + rootHalf * 3);
  }

  const centerline =
    `M${fmt(base.x - normal.x * half * 2)} ${fmt(base.y - normal.y * half * 2)}` +
    `L${fmt(base.x)} ${fmt(base.y)}` +
    `C${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(tip.x)} ${fmt(tip.y)}`;

  // Rhizoids: thin hairs creeping out along the path from the foot.
  const rhizoids: StemGeometry["rhizoids"] = [];
  const count = Math.max(0, Math.round(p.rhizoids * spread(0.5) + (rand() - 0.5) * 1.5));
  for (let i = 0; i < count; i++) {
    // Favour the side the foot creeps towards.
    const dir = rand() < 0.5 - asym * 0.5 ? -1 : 1;
    const reachR = half * (2 + flare * (1.2 + rand() * 1.6));
    const startPt = add(base, scale(p.tangent, dir * half * flare * (0.3 + rand() * 0.4)));
    const ang = dir * (60 + rand() * 50); // degrees from the normal
    const dirVec = rotate(normal, ang);
    const mid = add(startPt, scale(rotate(dirVec, (rand() - 0.5) * 50), reachR * 0.5));
    const end = add(startPt, scale(rotate(dirVec, (rand() - 0.5) * 30 + dir * 25), reachR));
    rhizoids.push({
      d: smoothPath([startPt, mid, end]),
      width: Math.max(0.3, half * thin * (0.35 + rand() * 0.3)),
    });
  }

  return {
    shapes,
    centerline,
    rhizoids,
    maxHalfWidth: Math.max(maxHalf + Math.abs(bowAmp) + bendAmp, reach),
    opacity: 1 - v * 0.22 * rand(),
  };
}
