import { type GlyphInfo, toFontAdapter } from "./font.ts";
import {
  type Point,
  add,
  angleDeg,
  clamp,
  dist,
  fmt,
  leftNormal,
  lerp,
  polygonOverlap,
  rotate,
  scale,
  sub,
} from "./geometry.ts";
import { type LaidOutChar, layoutText } from "./layout.ts";
import {
  DEFAULTS,
  type GrowOptions,
  type GrowtypeOptions,
  type PathStyle,
  type SporeOptions,
  type SwayOptions,
  type WaveOptions,
  wiltIndex,
} from "./options.ts";
import { OffsetArcMap, PathSampler } from "./path.ts";
import { Random, hashString } from "./random.ts";
import { buildStem } from "./stem.ts";

/** Where one character ended up. */
export interface PlacedCharacter {
  char: string;
  /** Index into the text (code points). */
  index: number;
  /** Arc length along the path. */
  s: number;
  /** Point where the stem's foot sits on the path. */
  base: Point;
  /** Point where the stem meets the glyph. */
  tip: Point;
  /** Glyph rotation in degrees. */
  rotation: number;
  /** Seconds after load when this character starts growing (0 without `grow`). */
  growDelay: number;
  /** Wilt intensity actually applied, 0–1. */
  wilt: number;
  /** Seconds (on the animation timeline) when the blast front reaches this character. */
  blastHit?: number;
  /** Convex outline of the glyph in SVG coordinates. */
  outline: Point[];
}

export interface GrowtypeResult {
  /** The complete, self-contained SVG markup. */
  svg: string;
  /** Font size actually used (may be smaller than requested if the text had to shrink to fit). */
  fontSize: number;
  /** Length of the path. */
  pathLength: number;
  characters: PlacedCharacter[];
  /** Seconds until the grow animation finishes (0 without `grow`). */
  growDuration: number;
}

const esc = (s: string): string =>
  /[&<>"]/.test(s)
    ? s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    : s;

function attrs(a: Record<string, string | number | undefined>): string {
  let out = "";
  for (const [k, v] of Object.entries(a)) {
    if (v === undefined) continue;
    // Formatted numbers never need escaping.
    out += ` ${k}="${typeof v === "number" ? fmt(v) : esc(v)}"`;
  }
  return out;
}

function style(s: Record<string, string | undefined>): string | undefined {
  const parts = Object.entries(s)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}:${v}`);
  return parts.length ? parts.join(";") : undefined;
}

const sec = (n: number) => `${fmt(n, 3)}s`;
const origin = (p: Point) => `${fmt(p.x)}px ${fmt(p.y)}px`;

function opt<T extends object>(v: boolean | T | undefined, defaults: T): Required<T> | null {
  if (!v) return null;
  return { ...defaults, ...(v === true ? {} : v) } as Required<T>;
}

function css(p: string): string {
  return [
    `.${p} .${p}-stretch,.${p} .${p}-sway,.${p} .${p}-gust,.${p} .${p}-pop,.${p} .${p}-spore{transform-box:view-box}`,
    `.${p}-reveal{animation:${p}-reveal .8s cubic-bezier(.4,0,.3,1) both}`,
    `.${p}-stretch{animation:${p}-stretch .8s cubic-bezier(.3,.6,.35,1.08) both}`,
    `@keyframes ${p}-stretch{from{transform:rotate(var(--ax)) scale(1,.001) rotate(calc(var(--ax) * -1))}to{transform:rotate(var(--ax)) scale(1,1) rotate(calc(var(--ax) * -1))}}`,
    `.${p}-pop{animation:${p}-pop .5s cubic-bezier(.3,.7,.4,1) both}`,
    `.${p}-fade{animation:${p}-fade .8s ease-out both}`,
    `.${p}-sway{animation:${p}-sway 3s ease-in-out infinite}`,
    `.${p}-gust{animation:${p}-gust 5s ease-in-out infinite}`,
    `.${p}-drift{animation:${p}-drift 6s ease-in-out infinite}`,
    `@keyframes ${p}-reveal{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}`,
    `@keyframes ${p}-pop{0%{transform:scale(0) rotate(-14deg);opacity:0}55%{transform:scale(1.1) rotate(4deg);opacity:1}100%{transform:scale(1) rotate(0)}}`,
    `@keyframes ${p}-fade{from{opacity:0}to{opacity:1}}`,
    `@keyframes ${p}-sway{0%,100%{transform:rotate(0)}25%{transform:rotate(var(--a))}75%{transform:rotate(calc(var(--a) * -1))}}`,
    `@keyframes ${p}-gust{0%{transform:rotate(0)}10%{transform:rotate(var(--g))}22%{transform:rotate(calc(var(--g) * -.35))}32%{transform:rotate(calc(var(--g) * .12))}42%,100%{transform:rotate(0)}}`,
    `@keyframes ${p}-drift{0%,100%{transform:translate(0,0)}50%{transform:translate(var(--dx),var(--dy))}}`,
    `.${p} .${p}-blast,.${p} .${p}-debris,.${p} .${p}-push{transform-box:view-box}`,
    `.${p}-blast{animation:${p}-blast 1.6s ease-out}`,
    `.${p}-debris{animation:${p}-debris 1s cubic-bezier(.2,.7,.3,1) both}`,
    `.${p}-push{animation:${p}-push 1.4s cubic-bezier(.2,.7,.3,1)}`,
    `@keyframes ${p}-blast{0%{transform:rotate(0)}8%{transform:rotate(var(--k))}24%{transform:rotate(calc(var(--k) * -.55))}40%{transform:rotate(calc(var(--k) * .3))}58%{transform:rotate(calc(var(--k) * -.14))}76%{transform:rotate(calc(var(--k) * .05))}100%{transform:rotate(0)}}`,
    `@keyframes ${p}-debris{0%{transform:translate(0,0);opacity:0}6%{opacity:.9}100%{transform:translate(var(--dx),var(--dy));opacity:0}}`,
    `@keyframes ${p}-push{0%{transform:translate(0,0)}12%{transform:translate(var(--px),var(--py))}100%{transform:translate(0,0)}}`,
    `@media (prefers-reduced-motion:reduce){.${p} *{animation:none!important}}`,
  ].join("");
}

interface Pose {
  c: LaidOutChar;
  base: Point;
  tangent: Point;
  normal: Point;
  /** Lean of the stalk in degrees (positive = clockwise). */
  lean: number;
  /** The lean needed to reach the glyph's laid-out position (non-zero when bases are gathered). */
  lean0: number;
  /** Path normal under the glyph itself; the glyph stands relative to this, not to its stalk. */
  glyphNormal: Point;
  length: number;
  /** Glyph rotation relative to its stalk, degrees. */
  twist: number;
  /** Wilt intensity 0–1. */
  u: number;
  /** Droop magnitude in degrees (from wilt); direction is `droopSign`. */
  droop: number;
  /** ±1, or in between while a blast blends between two resting placements. */
  droopSign: number;
  anchorLocal: Point;
  /** When the blast front reaches this sprout. */
  hit: number;
}

function poseGeometry(q: Pose) {
  const phi = q.lean + q.droopSign * q.droop;
  // The glyph keeps its own lean (not the structural fan-out of a gathered base) relative to the
  // path under it; the stalk curves to meet it.
  const tipDir = rotate(
    q.glyphNormal,
    q.lean - q.lean0 + q.droopSign * (q.droop + q.u * 6) + q.twist,
  );
  const anchorPt = add(q.base, scale(rotate(q.normal, phi), q.length * (1 - 0.12 * q.u)));
  return { tipDir, anchorPt, rotation: angleDeg(tipDir) + 90, glyphScale: 1 - 0.07 * q.u };
}

/** The glyph's convex outline in SVG coordinates. */
function glyphHull(q: Pose): Point[] {
  const hull = q.c.glyph.hull;
  if (!hull) return [];
  const { anchorPt, rotation, glyphScale } = poseGeometry(q);
  return hull.map((h) => add(anchorPt, rotate(scale(sub(h, q.anchorLocal), glyphScale), rotation)));
}

/** A thin quad standing in for the stalk. */
function stemQuad(q: Pose, half: number): Point[] {
  const { anchorPt } = poseGeometry(q);
  const d = sub(anchorPt, q.base);
  const l = Math.hypot(d.x, d.y) || 1;
  const n = { x: (-d.y / l) * half, y: (d.x / l) * half };
  return [add(q.base, n), add(anchorPt, n), sub(anchorPt, n), sub(q.base, n)];
}

/**
 * Nudge poses until no glyph overlaps its neighbours' glyphs or stalks by more than it would if
 * both stood straight up. Colliding pairs are made parallel and eased towards upright, with their
 * twist damped; untouched sprouts keep their randomness.
 */
function resolveOverlaps(poses: Pose[], o: { fontSize: number; stemHalf: number }) {
  const gap = o.fontSize * 0.04;

  interface Shape {
    glyph: Point[];
    stem: Point[];
    box: [number, number, number, number];
  }
  const shapeOf = (q: Pose): Shape => {
    const glyph = glyphHull(q);
    const stem = stemQuad(q, o.stemHalf);
    let x1 = Infinity;
    let y1 = Infinity;
    let x2 = -Infinity;
    let y2 = -Infinity;
    for (const v of [...glyph, ...stem]) {
      x1 = Math.min(x1, v.x);
      y1 = Math.min(y1, v.y);
      x2 = Math.max(x2, v.x);
      y2 = Math.max(y2, v.y);
    }
    return { glyph, stem, box: [x1, y1, x2, y2] };
  };
  const clash = (a: Shape, b: Shape): number => {
    if (!a.glyph.length || !b.glyph.length) return -Infinity;
    // Cheap reject: bounding boxes further apart than the gap can't matter.
    const sep = Math.max(
      a.box[0] - b.box[2],
      b.box[0] - a.box[2],
      a.box[1] - b.box[3],
      b.box[1] - a.box[3],
    );
    if (sep > gap * 2) return -sep;
    return Math.max(
      polygonOverlap(a.glyph, b.glyph),
      polygonOverlap(a.glyph, b.stem),
      polygonOverlap(a.stem, b.glyph),
    );
  };
  const upright = (q: Pose): Pose => ({ ...q, lean: q.lean0, twist: 0, droop: 0 });

  const shapes = poses.map(shapeOf);
  const uprights = poses.map((q) => shapeOf(upright(q)));
  const pairs: Array<{ i: number; j: number; allowed: number; seen: number }> = [];
  for (let i = 0; i < poses.length; i++) {
    for (let j = i + 1; j <= i + 2 && j < poses.length; j++) {
      // Some overlap is inherent (tight kerning, hollows in the path): measure it with both
      // standing straight up, and only correct what leaning and twisting add on top.
      const inherent = clash(uprights[i]!, uprights[j]!);
      pairs.push({ i, j, allowed: Math.max(0, inherent + gap) + o.fontSize * 0.02, seen: -1 });
    }
  }
  // A pair found clear stays clear until one of its shapes changes: only re-test those that did.
  // `seen` is the sum of both shapes' versions when the pair was last found clear.
  const version = poses.map(() => 0);
  for (let iter = 0; iter < 120; iter++) {
    let moved = false;
    for (const pr of pairs) {
      const v = version[pr.i]! + version[pr.j]!;
      if (pr.seen === v) continue;
      const excess = clash(shapes[pr.i]!, shapes[pr.j]!) + gap - pr.allowed;
      if (excess <= 0) {
        pr.seen = v;
        continue;
      }
      moved = true;
      const a = poses[pr.i]!;
      const b = poses[pr.j]!;
      // Make the pair parallel – same lean, same droop direction – which keeps their spacing even,
      // and ease both towards upright, which is guaranteed to be clear.
      const da = a.lean - a.lean0;
      const db = b.lean - b.lean0;
      const mean = ((da + db) / 2) * 0.9;
      a.lean = a.lean0 + da + (mean - da) * 0.5;
      b.lean = b.lean0 + db + (mean - db) * 0.5;
      a.twist *= 0.6;
      b.twist *= 0.6;
      b.droopSign = a.droopSign;
      if (iter >= 20) {
        a.droop *= 0.85;
        b.droop *= 0.85;
      }
      shapes[pr.i] = shapeOf(a);
      shapes[pr.j] = shapeOf(b);
      version[pr.i]++;
      version[pr.j]++;
    }
    if (!moved) break;
  }
}

/** The parts of a pose that wilting and overlap resolution decide. */
type Placement = Pick<Pose, "lean" | "twist" | "u" | "droop" | "droopSign">;

const fontIds = new WeakMap<object, number>();
let nextFontId = 1;

/** Identifies everything that decides where sprouts rest: all options but the blast's timing. */
function placementKey(o: GrowtypeOptions): string {
  const { blast: _blast, timeOffset: _timeOffset, ...rest } = o;
  return JSON.stringify(rest, (_key, value: unknown) => {
    // Font objects (parsed fonts, adapters) are compared by identity.
    if (
      value &&
      typeof value === "object" &&
      typeof (value as { glyph?: unknown }).glyph === "function"
    ) {
      let id = fontIds.get(value);
      if (!id) fontIds.set(value, (id = nextFontId++));
      return `font#${id}`;
    }
    return value;
  });
}

const placements = new Map<string, Placement[]>();

/** A small cache of resting placements: enough for the two ends of a few blasts in flight. */
function cachedPlacement(key: string, compute: () => Placement[]): Placement[] {
  let hit = placements.get(key);
  if (hit) {
    placements.delete(key);
  } else {
    hit = compute();
    if (placements.size >= 8) placements.delete(placements.keys().next().value!);
  }
  placements.set(key, hit);
  return hit;
}

const smoothstep = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

/** Render text growing out of a path. Returns the SVG and layout details. */
export function growtype(options: GrowtypeOptions): GrowtypeResult {
  const o = options;
  const font = toFontAdapter(o.font, o.emojiFont, o.emojiScale ?? DEFAULTS.emojiScale);
  const sampler = new PathSampler(o.path);
  const rng = new Random(o.seed);

  const fontSizeIn = o.fontSize ?? DEFAULTS.fontSize;
  const layoutMode = o.layout ?? DEFAULTS.layout;
  const justify = o.justify ?? DEFAULTS.justify;
  const side = o.side ?? DEFAULTS.side;
  const anchorMode = o.anchor ?? DEFAULTS.anchor;
  const stemLength = o.stemLength ?? DEFAULTS.stemLength;
  const lengthVar = o.stemLengthVariance ?? DEFAULTS.stemLengthVariance;
  const thickness = o.stemThickness ?? DEFAULTS.stemThickness;
  const flare = o.flare ?? DEFAULTS.flare;
  const wobble = o.wobble ?? DEFAULTS.wobble;
  const tiltIn = o.tilt ?? DEFAULTS.tilt;
  const [tiltMin, tiltMax] = typeof tiltIn === "number" ? [-tiltIn, tiltIn] : tiltIn;
  const twist = o.twist ?? DEFAULTS.twist;
  const coherence = clamp(o.tiltCoherence ?? DEFAULTS.tiltCoherence, 0, 1);
  const wilt = wiltIndex(o.wilt);
  const glyphColor = o.glyphColor ?? DEFAULTS.glyphColor;
  const stemColor = o.stemColor ?? DEFAULTS.stemColor;
  const grow = opt<GrowOptions>(o.grow, DEFAULTS.grow);
  const sway = opt<SwayOptions>(o.sway, DEFAULTS.sway);
  const wave = sway ? opt<WaveOptions>(sway.wave, DEFAULTS.wave) : null;
  const spores = opt<SporeOptions>(o.spores, DEFAULTS.spores);
  const pathStyle = opt<PathStyle>(o.showPath, DEFAULTS.path);
  const timeOffset = o.timeOffset ?? 0;
  /** An animation delay, shifted so the SVG starts `timeOffset` seconds into its timeline. */
  const at = (t: number) => sec(t - timeOffset);

  // Lay text out along the curve the glyphs actually sit on, then map back to the base path.
  const arcMap =
    (o.compensateCurvature ?? DEFAULTS.compensateCurvature) && stemLength > 0
      ? new OffsetArcMap(sampler, stemLength + fontSizeIn * 0.35, side)
      : null;
  const layout = layoutText({
    text: o.text,
    font,
    fontSize: fontSizeIn,
    letterSpacing: o.letterSpacing ?? DEFAULTS.letterSpacing,
    pathLength: arcMap?.length ?? sampler.length,
    mode: layoutMode,
    justify,
    inset: o.inset ?? DEFAULTS.inset,
  });
  const anchorOf = (g: GlyphInfo): Point =>
    anchorMode === "ink" && g.inkBottom ? g.inkBottom : { x: g.advance / 2, y: 0 };
  // Plant each sprout under its glyph's anchor rather than the middle of its advance, so an ink
  // anchor (e.g. the tail of a "j") doesn't shove the glyph sideways into its neighbours.
  for (const c of layout.chars) c.s = c.s - c.advance / 2 + anchorOf(c.glyph).x;
  if (arcMap) {
    for (const c of layout.chars) c.s = arcMap.toBase(c.s);
    layout.start = arcMap.toBase(layout.start);
    layout.end = arcMap.toBase(layout.end);
  }
  const fontSize = layout.fontSize;
  // Stems and spores scale with the text if it had to shrink to fit.
  const shrink = fontSize / fontSizeIn;

  // Smooth 0–1 noise along the path, with features a few characters wide.
  const fieldWaves = [0, 1, 2].map((k) => ({
    wavelength: fontSize * (2.5 + rng.value(k, "field-wl") * 4),
    phase: rng.value(k, "field-phase") * Math.PI * 2,
  }));
  const leanField = (s: number) =>
    0.5 +
    fieldWaves.reduce((acc, w) => acc + Math.sin((s / w.wavelength) * Math.PI * 2 + w.phase), 0) /
      4.5;

  const p = o.idPrefix ?? `gt${(hashString(`${rng.seed}|${o.text}`) % 46656).toString(36)}`;
  const visible = layout.chars.filter((c) => !c.isSpace);

  // ---- Grow ordering ----
  const order = new Map<number, number>();
  if (grow) {
    let mode = grow.order;
    if (mode === "auto") {
      mode =
        layoutMode === "fill"
          ? "start"
          : justify === "end"
            ? "end"
            : justify === "center"
              ? "center"
              : "start";
    }
    const mid = (layout.start + layout.end) / 2;
    const key = (c: (typeof visible)[number]) =>
      mode === "end"
        ? -c.s
        : mode === "center"
          ? Math.abs(c.s - mid)
          : mode === "random"
            ? rng.value(c.index, "order")
            : c.s;
    [...visible].sort((a, b) => key(a) - key(b)).forEach((c, rank) => order.set(c.index, rank));
  }
  const pathDrawTime = grow && pathStyle ? grow.pathDuration : 0;
  const growStart = grow ? grow.delay + pathDrawTime : 0;

  // ---- Poses: how each sprout leans, how tall it stands and how wilted it is ----
  // The blast, then any blasts it interrupted, newest first. Each one wilts sprouts towards the
  // stage its successor started from.
  const blasts: Array<typeof DEFAULTS.blast & { to: number; from: number; hits: number[] }> = [];
  for (let b = o.blast, to = wilt; b && blasts.length < 8; b = b.interrupts) {
    const from = b.fromWilt !== undefined ? wiltIndex(b.fromWilt) : to;
    blasts.push({ ...DEFAULTS.blast, ...b, to, from, hits: [] });
    to = from;
  }
  const blast = blasts[0] ?? null;
  const stemHalf = thickness * shrink * 0.8;

  // Within a word, stem bases can huddle closer together than the glyphs they hold up.
  const baseSpacing = clamp(o.baseSpacing ?? DEFAULTS.baseSpacing, 0, 1);
  const baseS = new Map<number, number>();
  let word: LaidOutChar[] = [];
  const flushWord = () => {
    if (word.length) {
      const mid = (word[0]!.s + word[word.length - 1]!.s) / 2;
      for (const w of word) baseS.set(w.index, mid + (w.s - mid) * baseSpacing);
    }
    word = [];
  };
  for (const c of layout.chars) {
    if (c.isSpace) flushWord();
    else word.push(c);
  }
  flushWord();

  const normalAt = (s: number) => {
    const ln = leftNormal(sampler.tangentAt(s));
    return side === "left" ? ln : scale(ln, -1);
  };

  const poses: Pose[] = visible.map((c) => {
    const i = c.index;
    const r = (ch: string) => rng.value(i, ch);
    const sBase = baseS.get(i) ?? c.s;
    const base = sampler.pointAt(sBase);
    const tangent = sampler.tangentAt(sBase);
    const normal = normalAt(sBase);
    const anchorLocal = anchorOf(c.glyph);
    // With an ink anchor the stem meets the glyph below its baseline (a descender's tail):
    // shorten it by that much so baselines still line up from letter to letter.
    const stemLen = stemLength * shrink * (1 + lengthVar * (r("length") * 2 - 1));
    let length = Math.max(stemLen * 0.25, stemLen - anchorLocal.y);
    // The structural lean that carries a gathered base out to where its glyph belongs.
    let lean0 = 0;
    if (sBase !== c.s) {
      const target = add(sampler.pointAt(c.s), scale(normalAt(c.s), length));
      const v = sub(target, base);
      lean0 =
        (Math.atan2(normal.x * v.y - normal.y * v.x, normal.x * v.x + normal.y * v.y) * 180) /
        Math.PI;
      length = Math.hypot(v.x, v.y);
    }
    // Blend independent jitter with a smooth "field" so neighbours lean together and collide less.
    const leanT = clamp((1 - coherence) * r("tilt") + coherence * leanField(c.s), 0, 1);
    const jitter = tiltMin + (tiltMax - tiltMin) * leanT;
    return {
      c,
      base,
      tangent,
      normal,
      lean: lean0 + jitter,
      lean0,
      glyphNormal: sBase !== c.s ? normalAt(c.s) : normal,
      length,
      twist: twist * (r("twist") * 2 - 1),
      u: 0,
      droop: 0,
      droopSign: Math.abs(jitter) > 2 ? Math.sign(jitter) : r("droop-side") < 0.5 ? -1 : 1,
      anchorLocal,
      hit: 0,
    };
  });

  // ---- Blast waves: when each (invisible) front reaches each sprout ----
  if (poses.length) {
    const xs = poses.map((q) => q.base.x);
    const midY =
      poses.reduce((acc, q) => acc + q.base.y + q.normal.y * q.length * 0.6, 0) / poses.length;
    for (const b of blasts) {
      const origin = {
        x: b.direction === "left" ? Math.min(...xs) - fontSize : Math.max(...xs) + fontSize,
        y: midY,
      };
      const reach = Math.max(...poses.map((q) => dist(origin, q.base)), 1);
      b.hits = poses.map((q) => b.at + (b.duration * dist(origin, q.base)) / reach);
    }
    if (blast) poses.forEach((q, k) => (q.hit = blast.hits[k]!));
  }
  // ---- Placement: wilt each sprout, then nudge neighbours apart ----
  // Overlaps are only resolved for sprouts at rest. A blast glides each sprout from its resting
  // placement at the old wilt to the one at the new wilt, and may overlap a little on the way.
  const avoidOverlap = (o.avoidOverlap ?? DEFAULTS.avoidOverlap) && poses.length > 1;
  const settle = (w: number): Placement[] => {
    const settled = poses.map((q) => {
      const r = (ch: string) => rng.value(q.c.index, ch);
      // Per-character jitter fades in with the first stage so fractional wilt tweens smoothly from 0.
      const u = clamp(w / 3 + (r("wilt") - 0.5) * 0.22 * Math.min(1, w), 0, 1);
      return { ...q, u, droop: u * 13 * (0.75 + 0.5 * r("droop")) };
    });
    if (avoidOverlap) resolveOverlaps(settled, { fontSize, stemHalf });
    return settled.map(({ lean, twist, u, droop, droopSign }) => ({
      lean,
      twist,
      u,
      droop,
      droopSign,
    }));
  };
  if (blast) {
    // Blast frames are re-rendered many times a second with only `blast` and `timeOffset`
    // changing, so the resting placements are remembered between calls.
    const key = placementKey(o);
    const rest = (w: number) => cachedPlacement(`${key}|${w}`, () => settle(w));
    // Where blast `n` has sprout `k` at timeOffset: wherever the blast it interrupted had it (or
    // resting at its starting wilt) until the front arrives, then gliding to rest at its wilt.
    const placementIn = (n: number, k: number): Placement => {
      const b = blasts[n]!;
      const a = n + 1 < blasts.length ? placementIn(n + 1, k) : rest(b.from)[k]!;
      const z = rest(b.to)[k]!;
      const t = smoothstep((timeOffset - b.hits[k]!) / 0.35);
      return {
        lean: lerp(a.lean, z.lean, t),
        twist: lerp(a.twist, z.twist, t),
        u: lerp(a.u, z.u, t),
        droop: lerp(a.droop, z.droop, t),
        // Fractional while blending, so a sprout drooping the other way swings through upright.
        droopSign: lerp(a.droopSign, z.droopSign, t),
      };
    };
    poses.forEach((q, k) => Object.assign(q, placementIn(0, k)));
  } else {
    settle(wilt).forEach((pl, k) => Object.assign(poses[k]!, pl));
  }

  const charsOut: Array<{ s: number; base: Point; inner: string }> = [];
  const sporesOut: string[] = [];
  const debrisOut: string[] = [];
  const placed: PlacedCharacter[] = [];
  let growEndAll = 0;

  for (const [qk, q] of poses.entries()) {
    const { c, base, tangent, normal, u, anchorLocal } = q;
    const i = c.index;
    const r = (ch: string) => rng.value(i, ch);
    const { anchorPt, tipDir, rotation, glyphScale } = poseGeometry(q);
    const g = c.glyph;
    // Push the stem a little way into the glyph so the joint reads as attached.
    const overlap = Math.min(thickness * shrink * 1.4, fontSize * 0.08);
    const tip = add(anchorPt, scale(tipDir, overlap));

    const stem = buildStem({
      base,
      normal,
      tangent,
      tip,
      tipDir,
      thickness: thickness * shrink,
      flare,
      wobble,
      wilt: u,
      variance: o.stemVariance ?? DEFAULTS.stemVariance,
      rand: rng.stream(i, "stem"),
    });

    // ---- Timing ----
    const dur = grow?.duration ?? 0;
    const delay = grow
      ? growStart + (order.get(i) ?? 0) * grow.stagger + r("grow-jitter") * grow.stagger * 0.6
      : 0;
    const growEnd = delay + dur;
    growEndAll = Math.max(growEndAll, growEnd);

    // ---- Stem ----
    const stemAttrs = {
      class: `${p}-stem`,
      fill: stemColor,
      opacity: stem.opacity < 0.995 ? fmt(stem.opacity, 2) : undefined,
    };
    let stemMarkup =
      stem.shapes.length === 1
        ? `<path${attrs({ ...stemAttrs, d: stem.shapes[0]! })}/>`
        : `<g${attrs(stemAttrs)}>${stem.shapes.map((d) => `<path d="${d}"/>`).join("")}</g>`;
    if (grow) {
      // Stretch the stalk out of its foot along its own axis. A pure transform animation:
      // cheap to composite and nothing to re-rasterise per frame (unlike an animated mask).
      const axis = sub(anchorPt, base);
      stemMarkup = `<g${attrs({
        class: `${p}-stretch`,
        style: style({
          "--ax": `${fmt(angleDeg(axis) - 90)}deg`,
          "transform-origin": origin(base),
          "animation-delay": at(delay + dur * 0.1),
          "animation-duration": sec(dur * 0.6),
        }),
      })}>${stemMarkup}</g>`;
    }

    // ---- Glyph ----
    const color = o.palette?.length
      ? o.palette[Math.floor(r("palette") * o.palette.length)]!
      : glyphColor;
    const transform =
      `translate(${fmt(anchorPt.x)} ${fmt(anchorPt.y)}) rotate(${fmt(rotation)})` +
      (glyphScale !== 1 ? ` scale(${fmt(glyphScale, 3)})` : "") +
      ` translate(${fmt(-anchorLocal.x)} ${fmt(-anchorLocal.y)})`;
    let glyphMarkup: string;
    if (g.shape.kind === "path") {
      glyphMarkup = `<path${attrs({ d: g.shape.d, fill: color, transform })}/>`;
    } else {
      glyphMarkup = `<text${attrs({ ...g.shape.attrs, x: 0, y: 0, fill: color, transform })}>${esc(g.shape.char)}</text>`;
    }
    const popStyle = grow
      ? style({
          "transform-origin": origin(anchorPt),
          "animation-delay": at(delay + dur * 0.6),
          "animation-duration": sec(dur * 0.4),
        })
      : undefined;
    const glyphGroup = `<g${attrs({ class: grow ? `${p}-pop` : undefined, style: popStyle })}>${glyphMarkup}</g>`;

    // ---- Sway ----
    let inner = stemMarkup + glyphGroup;
    if (sway) {
      // One shared period with the phase following position along the path: a slow travelling
      // wave, so neighbours move nearly together instead of swinging into each other.
      const period = sway.period;
      const phase = ((c.s / (fontSize * 10)) * period + r("sway-phase") * period * 0.08) % period;
      const amp = sway.amplitude * (0.8 + 0.4 * r("sway-amp"));
      // Start on a beat of this sprout's phase, but never before it has finished growing.
      const startAfter = grow ? growEnd : 0;
      const swayDelay =
        phase + Math.ceil((startAfter - phase) / period) * period - (grow ? 0 : period);
      inner = `<g${attrs({
        class: `${p}-sway`,
        style: style({
          "--a": `${fmt(amp)}deg`,
          "transform-origin": origin(base),
          "animation-duration": sec(period),
          "animation-delay": at(swayDelay),
        }),
      })}>${inner}</g>`;
    }
    // One knock-back per blast still playing, so an interrupted blast's recoil plays out.
    blasts.forEach((b, n) => {
      const dir = b.direction === "left" ? 1 : -1;
      const k = b.strength * dir * (0.75 + 0.5 * r("blast"));
      const hit = b.hits[qk]!;
      inner = `<g${attrs({
        class: `${p}-blast`,
        style: style({
          "--k": `${fmt(k)}deg`,
          "transform-origin": origin(base),
          "animation-delay": at(hit),
          "animation-duration": sec(b.recoil),
        }),
      })}>${inner}</g>`;
      // Debris knocked loose by the shock front.
      const dr = rng.stream(i, n ? `debris${n}` : "debris");
      for (let k2 = 0; k2 < b.debris; k2++) {
        const from = add(base, scale(normal, q.length * dr()));
        debrisOut.push(
          `<circle${attrs({
            class: `${p}-debris`,
            cx: from.x,
            cy: from.y,
            r: (0.6 + dr() * 1.4) * shrink,
            fill: b.color ?? stemColor,
            style: style({
              "--dx": `${fmt(dir * (30 + dr() * 70) * shrink)}px`,
              "--dy": `${fmt((dr() - 0.75) * 50 * shrink)}px`,
              "animation-delay": at(hit + dr() * 0.08),
              "animation-duration": sec(0.7 + dr() * 0.7),
            }),
          })}/>`,
        );
      }
    });
    charsOut.push({ s: c.s, base, inner });

    // ---- Spores ----
    if (spores) {
      const sr = rng.stream(i, "spores");
      const n = Math.floor(spores.count * (1 + u * 0.5) + sr());
      const centre = add(anchorPt, scale(tipDir, fontSize * 0.4));
      const across = rotate(tipDir, 90);
      for (let k = 0; k < n; k++) {
        const pos = add(
          add(centre, scale(tipDir, (sr() - 0.35) * spores.spread * fontSize)),
          scale(across, (sr() - 0.5) * spores.spread * fontSize * 1.5),
        );
        const rad = spores.size * shrink * (0.5 + sr());
        const hollow = sr() < 0.2;
        const opacity = 0.35 + sr() * 0.5;
        const dot = `<circle${attrs({
          cx: pos.x,
          cy: pos.y,
          r: rad,
          fill: hollow ? "none" : (spores.color ?? stemColor),
          stroke: hollow ? (spores.color ?? stemColor) : undefined,
          "stroke-width": hollow ? Math.max(0.3, rad * 0.4) : undefined,
          opacity,
        })}/>`;
        let markup = dot;
        if (sway) {
          markup = `<g${attrs({
            class: `${p}-drift`,
            style: style({
              "--dx": `${fmt((sr() - 0.5) * 6 * shrink)}px`,
              "--dy": `${fmt(-(1 + sr() * 4) * shrink)}px`,
              "animation-duration": sec(4 + sr() * 5),
              "animation-delay": at(-sr() * 9),
            }),
          })}>${markup}</g>`;
        }
        for (const b of blasts) {
          const dir = b.direction === "left" ? 1 : -1;
          markup = `<g${attrs({
            class: `${p}-push`,
            style: style({
              "--px": `${fmt(dir * (8 + sr() * 16) * shrink)}px`,
              "--py": `${fmt(-(sr() * 8) * shrink)}px`,
              "animation-delay": at(b.hits[qk]!),
            }),
          })}>${markup}</g>`;
        }
        if (grow) {
          markup = `<g${attrs({
            class: `${p}-fade`,
            style: style({ "animation-delay": at(growEnd + sr() * 0.5) }),
          })}>${markup}</g>`;
        }
        sporesOut.push(markup);
      }
    }

    placed.push({
      char: c.char,
      index: i,
      s: c.s,
      base,
      tip: anchorPt,
      rotation,
      growDelay: delay,
      wilt: u,
      blastHit: blast ? q.hit : undefined,
      outline: glyphHull(q),
    });
  }

  // ---- Assemble characters (with optional travelling gust) ----
  const charGroups = charsOut.map((c) => {
    if (!wave) return `<g class="${p}-c">${c.inner}</g>`;
    const gustDelay = growEndAll + (c.s / sampler.length) * wave.travel;
    return `<g class="${p}-c"><g${attrs({
      class: `${p}-gust`,
      style: style({
        "--g": `${fmt(wave.amplitude)}deg`,
        "transform-origin": origin(c.base),
        "animation-duration": sec(Math.max(wave.period, wave.travel * 0.5)),
        "animation-delay": at(gustDelay),
      }),
    })}>${c.inner}</g></g>`;
  });

  // ---- Substrate path ----
  let pathMarkup = "";
  if (pathStyle) {
    pathMarkup = `<path${attrs({
      class: grow ? `${p}-reveal` : undefined,
      d: sampler.data,
      fill: "none",
      stroke: pathStyle.color ?? stemColor,
      "stroke-width": pathStyle.width,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      opacity: pathStyle.opacity === 1 ? undefined : pathStyle.opacity,
      pathLength: grow ? 1 : undefined,
      "stroke-dasharray": grow ? "1 1" : undefined,
      style: grow
        ? style({
            "animation-delay": at(grow.delay),
            "animation-duration": sec(Math.max(0.01, grow.pathDuration)),
          })
        : undefined,
    })}/>`;
  }

  // ---- Blast debris ----
  const blastMarkup = debrisOut.length
    ? `<g class="${p}-debris-layer">${debrisOut.join("")}</g>`
    : "";

  const title = o.title === false ? null : (o.title ?? o.text);
  const animated = Boolean(grow || sway || blast);
  const svg =
    `<svg${attrs({
      xmlns: "http://www.w3.org/2000/svg",
      class: p,
      width: o.width,
      height: o.height,
      viewBox: `0 0 ${fmt(o.width)} ${fmt(o.height)}`,
      role: "img",
      "aria-label": title ?? undefined,
    })}>` +
    (title ? `<title>${esc(title)}</title>` : "") +
    (animated ? `<style>${css(p)}</style>` : "") +
    (o.background ? `<rect width="100%" height="100%" fill="${esc(o.background)}"/>` : "") +
    pathMarkup +
    `<g class="${p}-chars">${charGroups.join("")}</g>` +
    (sporesOut.length ? `<g class="${p}-spores">${sporesOut.join("")}</g>` : "") +
    blastMarkup +
    `</svg>`;

  return {
    svg,
    fontSize,
    pathLength: sampler.length,
    characters: placed,
    growDuration: grow ? growEndAll + 0.5 : 0,
  };
}

/** Render text growing out of a path and return just the SVG markup. */
export function renderGrowtype(options: GrowtypeOptions): string {
  return growtype(options).svg;
}

/** Render into a live `<svg>` element (browser only). */
export function createGrowtypeElement(options: GrowtypeOptions): SVGSVGElement {
  const doc = new DOMParser().parseFromString(growtype(options).svg, "image/svg+xml");
  return document.importNode(doc.documentElement, true) as unknown as SVGSVGElement;
}
