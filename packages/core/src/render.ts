import { type GlyphInfo, toFontAdapter } from "./font.ts";
import {
  type Point,
  add,
  angleDeg,
  clamp,
  fmt,
  leftNormal,
  lerp,
  lerpPt,
  polygonOverlap,
  rotate,
  scale,
  sub,
} from "./geometry.ts";
import { type LaidOutChar, layoutText } from "./layout.ts";
import {
  DEFAULTS,
  type ExitOptions,
  type GrowOptions,
  type GrowtypeOptions,
  type PathStyle,
  type SporeOptions,
  type SwayOptions,
  type WaveOptions,
  wiltIndex,
} from "./options.ts";
import { getOffsetArcMap, getPathSampler } from "./path.ts";
import { Random, hashString, normalizeSeed } from "./random.ts";
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

const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const sec = (n: number) => `${fmt(n, 3)}s`;
const origin = (p: Point) => `${fmt(p.x)}px ${fmt(p.y)}px`;

function opt<T extends object>(v: boolean | T | undefined, defaults: T): Required<T> | null {
  if (!v) return null;
  return { ...defaults, ...(v === true ? {} : v) } as Required<T>;
}

function css(p: string, exit: boolean): string {
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
    // Leaving: the glyph hops off its stalk and falls, tumbling, out of view; the stalk flops to
    // one side and shrinks back into its foot; spores fade.
    ...(exit ? exitCss(p) : []),
    `@media (prefers-reduced-motion:reduce){.${p} *{animation:none!important}}`,
  ].join("");
}

function exitCss(p: string): string[] {
  return [
    `.${p} .${p}-drop,.${p} .${p}-wither{transform-box:view-box}`,
    `.${p}-drop{animation:${p}-drop 1s linear both}`,
    `.${p}-wither{animation:${p}-wither 1s cubic-bezier(.5,0,.8,.5) both}`,
    `.${p}-vanish{animation:${p}-vanish .6s ease-in both}`,
    `@keyframes ${p}-drop{0%{transform:translate(0,0) rotate(0);opacity:1;animation-timing-function:cubic-bezier(.2,.6,.4,1)}14%{transform:translate(calc(var(--fx) * .08),calc(var(--fh) * -1)) rotate(calc(var(--fr) * .08));animation-timing-function:cubic-bezier(.55,0,1,.5)}75%{opacity:1}100%{transform:translate(var(--fx),var(--fy)) rotate(var(--fr));opacity:0}}`,
    `@keyframes ${p}-wither{0%{transform:rotate(0) rotate(var(--ax)) scale(1,1) rotate(calc(var(--ax) * -1))}45%{transform:rotate(calc(var(--wr) * .75)) rotate(var(--ax)) scale(1,.8) rotate(calc(var(--ax) * -1))}100%{transform:rotate(var(--wr)) rotate(var(--ax)) scale(.6,.001) rotate(calc(var(--ax) * -1))}}`,
    `@keyframes ${p}-vanish{to{opacity:0}}`,
  ];
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
  /** How far a wilting glyph tips towards the side it slumps to, degrees. */
  droop: number;
  /** The side it slumps to: ±1, or in between while a transition blends two placements. */
  droopSign: number;
  anchorLocal: Point;
  /** Arc length of the stalk's foot. */
  sBase: number;
  /** The point on the path under the glyph's own place in the text, where it sinks to. */
  ground: Point;
  /** Lifts a sunken glyph so it never sits below the path. */
  lift: Point;
}

/** How far a wilting glyph has sunk under its own weight: 0 standing, 1 down on the path. */
const sagOf = (u: number) => (u > 0 ? u ** 1.2 : u);

function poseGeometry(q: Pose) {
  // Wilting, the glyph sinks under its own weight and the stalk buckles beneath it. It comes to
  // rest a little to one side of its foot, tipped slightly that way, but still the right way up.
  // It sinks towards the path under its own place in the text (not its stalk's foot, which may
  // huddle with its word's), so the letters keep their order and spacing, and stops a little
  // above it, held up by its buckled stalk.
  const sag = sagOf(q.u);
  const standing = add(q.base, scale(rotate(q.normal, q.lean), q.length));
  const fallen = add(
    add(q.ground, scale(q.glyphNormal, q.length * 0.2)),
    scale(rotate(q.glyphNormal, 90), q.droopSign * q.c.advance * 0.15),
  );
  // The glyph keeps its own lean (not the structural fan-out of a gathered base) relative to the
  // path under it; the stalk curves to meet it.
  const tipDir = rotate(q.glyphNormal, q.lean - q.lean0 + q.twist + q.droopSign * q.droop);
  const anchorPt = add(lerpPt(standing, fallen, sag), q.lift);
  return { tipDir, anchorPt, rotation: angleDeg(tipDir) + 90, glyphScale: 1 - 0.1 * q.u };
}

type PoseGeometry = ReturnType<typeof poseGeometry>;

/** The glyph's convex outline in SVG coordinates. */
function glyphHull(q: Pose, geom: PoseGeometry = poseGeometry(q)): Point[] {
  const hull = q.c.glyph.hull;
  if (!hull) return [];
  const { anchorPt, rotation, glyphScale } = geom;
  return hull.map((h) => add(anchorPt, rotate(scale(sub(h, q.anchorLocal), glyphScale), rotation)));
}

/** A thin quad standing in for the stalk. */
function stemQuad(q: Pose, half: number, geom: PoseGeometry = poseGeometry(q)): Point[] {
  const { anchorPt } = geom;
  const d = sub(anchorPt, q.base);
  const l = Math.hypot(d.x, d.y) || 1;
  const n = { x: (-d.y / l) * half, y: (d.x / l) * half };
  return [add(q.base, n), add(anchorPt, n), sub(anchorPt, n), sub(q.base, n)];
}

/**
 * Relaxation budget for `resolveOverlaps`. Pairs that come apart stop being re-tested, so a
 * typical render converges in a handful of steps; the budget only bounds the crowded case, where
 * it was by far the most expensive thing in a render. Easing droop away is what makes the stuck
 * pairs converge, so it starts early enough to still do its work within the budget.
 */
const MAX_RELAX_STEPS = 32;
const DROOP_DAMP_AFTER = 6;
const DROOP_DAMP = 0.8;

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
    // One pose solve for both outlines: this runs for every pose on every relaxation step.
    const geom = poseGeometry(q);
    const glyph = glyphHull(q, geom);
    const stem = stemQuad(q, o.stemHalf, geom);
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
  for (let iter = 0; iter < MAX_RELAX_STEPS; iter++) {
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
      if (iter >= DROOP_DAMP_AFTER) {
        a.droop *= DROOP_DAMP;
        b.droop *= DROOP_DAMP;
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

/** Identifies everything that decides where sprouts rest: all options but a transition's. */
function placementKey(o: GrowtypeOptions): string {
  const {
    wiltTransition: _transition,
    textTransition: _textTransition,
    exit: _exit,
    timeOffset: _timeOffset,
    ...rest
  } = o;
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

/** A small cache of resting placements: enough for the two ends of a few transitions in flight. */
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

/** Wilting: sinks under its own weight, bottoms out, bounces once and settles. 0 → 1. */
function fallEase(t: number): number {
  const x = clamp(t, 0, 1);
  if (x < 0.55) return (x / 0.55) ** 2;
  const b = (x - 0.55) / 0.45;
  return 1 - 0.16 * Math.sin(Math.PI * b) * (1 - b);
}

/** Recovering: springs back up, overshoots and settles. 0 → 1, peaking a little above. */
function springEase(t: number): number {
  const x = clamp(t, 0, 1) - 1;
  return 1 + 2.7 * x ** 3 + 1.7 * x ** 2;
}

/** Render text growing out of a path. Returns the SVG and layout details. */
export function growtype(options: GrowtypeOptions): GrowtypeResult {
  const tt = options.textTransition;
  if (!tt || tt.from === options.text) return render(options).result;
  const exit = { ...DEFAULTS.exit, ...tt };
  const end = exit.at + exit.stagger + exit.duration;
  // Both texts share one stylesheet, so they share a prefix.
  const idPrefix = prefixFor(options);
  const leaving = (options.timeOffset ?? 0) < end;
  const incoming = render({ ...options, idPrefix }, { growAt: end, exitCss: leaving });
  if (!leaving) return incoming.result;
  // The old text's sprouts go first, underneath the new text's.
  const { body } = render({ ...options, text: tt.from, idPrefix, exit });
  const chars = `<g class="${idPrefix}-chars">`;
  return { ...incoming.result, svg: incoming.result.svg.replace(chars, body + chars) };
}

const prefixOf = (o: GrowtypeOptions) =>
  `gt${(hashString(`${normalizeSeed(o.seed)}|${o.text}`) % 46656).toString(36)}`;

/**
 * The prefix is interpolated into the stylesheet and into class attributes, where neither
 * attribute nor text escaping applies, so it has to be a bare CSS identifier. Anything else
 * could close the `<style>` element and inject markup into a host that inlines the SVG.
 */
const ID_PREFIX = /^[A-Za-z][\w-]*$/;

function checkPrefix(prefix: string): string {
  if (!ID_PREFIX.test(prefix)) {
    throw new Error(
      `growtype: idPrefix must be a CSS identifier matching ${String(ID_PREFIX)}, got ${JSON.stringify(prefix)}`,
    );
  }
  return prefix;
}

/** The CSS/id prefix for a render: the caller's, once validated, or one derived from the text. */
const prefixFor = (o: GrowtypeOptions): string =>
  o.idPrefix === undefined ? prefixOf(o) : checkPrefix(o.idPrefix);

/**
 * Render one text. Text coming in after another grows from `growAt` seconds into the timeline
 * (even without `grow`), under a path that's already drawn.
 */
function render(
  o: GrowtypeOptions,
  incoming?: { growAt: number; exitCss: boolean },
): { result: GrowtypeResult; body: string } {
  const font = toFontAdapter(o.font, o.emojiFont, o.emojiScale ?? DEFAULTS.emojiScale);
  const sampler = getPathSampler(o.path);
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
  const pathGrow = opt<GrowOptions>(o.grow, DEFAULTS.grow);
  const grow = incoming ? opt<GrowOptions>(o.grow || true, DEFAULTS.grow) : pathGrow;
  const sway = opt<SwayOptions>(o.sway, DEFAULTS.sway);
  const wave = sway ? opt<WaveOptions>(sway.wave, DEFAULTS.wave) : null;
  const spores = opt<SporeOptions>(o.spores, DEFAULTS.spores);
  const pathStyle = opt<PathStyle>(o.showPath, DEFAULTS.path);
  const exit = opt<ExitOptions>(o.exit, DEFAULTS.exit);
  const timeOffset = o.timeOffset ?? 0;
  /** An animation delay, shifted so the SVG starts `timeOffset` seconds into its timeline. */
  const at = (t: number) => sec(t - timeOffset);

  // Lay text out along the curve the glyphs actually sit on, then map back to the base path.
  const arcMap =
    (o.compensateCurvature ?? DEFAULTS.compensateCurvature) && stemLength > 0
      ? getOffsetArcMap(sampler, stemLength + fontSizeIn * 0.35, side)
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

  const p = prefixFor(o);
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
  const growStart = incoming ? incoming.growAt + grow!.delay : grow ? grow.delay + pathDrawTime : 0;

  // ---- Poses: how each sprout leans, how tall it stands and how wilted it is ----
  // The wilt transition, then any it interrupted, newest first. Each one heads for the stage
  // its successor started from.
  const transitions: Array<
    typeof DEFAULTS.wiltTransition & { from: number; to: number; starts: number[] }
  > = [];
  for (let tr = o.wiltTransition, to = wilt; tr && transitions.length < 8; tr = tr.interrupts) {
    const from = wiltIndex(tr.from);
    const { at, duration, stagger, direction } = { ...DEFAULTS.wiltTransition, ...tr };
    transitions.push({ at, duration, stagger, direction, from, to, starts: [] });
    to = from;
  }
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
      // Which side of its foot it slumps to as it wilts.
      droopSign: r("droop-side") < 0.5 ? -1 : 1,
      anchorLocal,
      sBase,
      ground: sampler.pointAt(c.s),
      lift: { x: 0, y: 0 },
    };
  });

  // ---- Transitions and exit: when each sprout sets off, in turn along the path ----
  const s0 = Math.min(...poses.map((q) => q.sBase));
  const span = Math.max(...poses.map((q) => q.sBase)) - s0 || 1;
  const inTurn = (t: { at: number; stagger: number; direction: "start" | "end" | "random" }) =>
    poses.map((q) => {
      const f = t.direction === "random" ? rng.value(q.c.index, "turn") : (q.sBase - s0) / span;
      return t.at + t.stagger * (t.direction === "end" ? 1 - f : f);
    });
  for (const tr of transitions) tr.starts = inTurn(tr);
  const exitStarts = exit ? inTurn(exit) : [];

  // ---- Placement: wilt each sprout, then nudge neighbours apart ----
  // Overlaps are only resolved for sprouts at rest. A transition moves each sprout from where it
  // is to its resting placement at the new wilt, and may overlap a little on the way.
  const avoidOverlap = (o.avoidOverlap ?? DEFAULTS.avoidOverlap) && poses.length > 1;
  const settle = (w: number): Placement[] => {
    const settled = poses.map((q) => {
      const r = (ch: string) => rng.value(q.c.index, ch);
      // Per-character jitter fades in with the first stage so fractional wilt tweens smoothly from 0.
      const u = clamp(w / 3 + (r("wilt") - 0.5) * 0.22 * Math.min(1, w), 0, 1);
      // The glyph tips a little towards the side it slumps to: enough to look wilted, not so
      // much that it stops being readable.
      return { ...q, u, droop: (8 + 12 * r("droop")) * u ** 0.8 };
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
  if (transitions.length) {
    // Transition frames are re-rendered many times a second with only the transition and
    // `timeOffset` changing, so the resting placements are remembered between calls.
    const key = placementKey(o);
    const rest = (w: number) => cachedPlacement(`${key}|${w}`, () => settle(w));
    // Where transition `n` has sprout `k` at timeOffset: wherever the transition it interrupted
    // had it (or resting at its starting wilt) until its turn, then moving to rest at its wilt.
    const placementIn = (n: number, k: number): Placement => {
      const tr = transitions[n]!;
      const a = n + 1 < transitions.length ? placementIn(n + 1, k) : rest(tr.from)[k]!;
      const z = rest(tr.to)[k]!;
      const x = (timeOffset - tr.starts[k]!) / Math.max(tr.duration, 0.01);
      const t = tr.to > tr.from ? fallEase(x) : springEase(x);
      return {
        lean: lerp(a.lean, z.lean, t),
        twist: lerp(a.twist, z.twist, t),
        u: clamp(lerp(a.u, z.u, t), -0.2, 1),
        droop: lerp(a.droop, z.droop, t),
        // Fractional while blending, so a sprout drooping the other way swings through upright.
        droopSign: lerp(a.droopSign, z.droopSign, t),
      };
    };
    poses.forEach((q, k) => Object.assign(q, placementIn(0, k)));
  } else {
    settle(wilt).forEach((pl, k) => Object.assign(poses[k]!, pl));
  }

  // ---- Sunken glyphs rest on the path, never through it ----
  const clearance = stemHalf * 1.5;
  for (const q of poses) {
    const weight = clamp((q.u - 0.3) / 0.4, 0, 1);
    if (weight === 0) continue;
    const hull = glyphHull(q);
    if (!hull.length) continue;
    // The ground under the glyph: the path where it has sunk to.
    const { anchorPt } = poseGeometry(q);
    const sGround = q.c.s + dot(sub(anchorPt, q.ground), q.tangent);
    const ground = sampler.pointAt(sGround);
    const up = normalAt(sGround);
    const lowest = Math.min(...hull.map((h) => dot(sub(h, ground), up)));
    if (lowest < clearance) q.lift = scale(up, (clearance - lowest) * weight);
  }

  const charsOut: Array<{ s: number; base: Point; inner: string; calm: number }> = [];
  const sporesOut: string[] = [];
  const placed: PlacedCharacter[] = [];
  let growEndAll = 0;

  poses.forEach((q, k) => {
    const { c, base, tangent, normal, u, anchorLocal } = q;
    const i = c.index;
    const r = (ch: string) => rng.value(i, ch);
    const { anchorPt, tipDir, rotation, glyphScale } = poseGeometry(q);
    const g = c.glyph;
    // Push the stem a little way into the glyph so the joint reads as attached.
    const overlap = Math.min(thickness * shrink * 1.4, fontSize * 0.08);
    const tip = add(anchorPt, scale(tipDir, overlap));

    // Under a sinking glyph the stalk buckles, bowing out (and up, never into the ground) away
    // from the side the glyph tips to.
    const sag = sagOf(u);
    const stem = buildStem({
      base,
      normal,
      ...(sag > 0 && {
        buckle: scale(rotate(normal, -q.droopSign * 55), sag * q.length * 0.45),
      }),
      tangent,
      tip,
      tipDir,
      thickness: thickness * shrink,
      flare,
      wobble,
      wilt: clamp(u, 0, 1),
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
    let glyphGroup = `<g${attrs({ class: grow ? `${p}-pop` : undefined, style: popStyle })}>${glyphMarkup}</g>`;

    // ---- Exit ----
    const exitAt = exit ? exitStarts[k]! : 0;
    if (exit) {
      // The glyph pops off its stalk and drops (down the screen, whichever way the path runs)
      // until it's out of view, tumbling towards the side it slumps to.
      const centre = add(anchorPt, scale(tipDir, fontSize * 0.35));
      const side = q.droopSign < 0 ? -1 : 1;
      glyphGroup = `<g${attrs({
        class: `${p}-drop`,
        style: style({
          "--fx": `${fmt(side * (0.2 + r("exit-x")) * fontSize * 0.8)}px`,
          "--fh": `${fmt((0.1 + 0.15 * r("exit-hop")) * fontSize)}px`,
          "--fy": `${fmt(Math.max(o.height - centre.y, 0) + fontSize * 1.2)}px`,
          "--fr": `${fmt(side * (40 + 120 * r("exit-spin")))}deg`,
          "transform-origin": origin(centre),
          "animation-delay": at(exitAt),
          "animation-duration": sec(exit.duration * 0.75),
        }),
      })}>${glyphGroup}</g>`;
      // As soon as the glyph lets go, its stalk flops over the other way and shrinks back into
      // its foot, while the glyph is still falling.
      stemMarkup = `<g${attrs({
        class: `${p}-wither`,
        style: style({
          "--ax": `${fmt(angleDeg(sub(anchorPt, base)) - 90)}deg`,
          "--wr": `${fmt(-side * (25 + 30 * r("exit-wilt")))}deg`,
          "transform-origin": origin(base),
          "animation-delay": at(exitAt + exit.duration * 0.1),
          "animation-duration": sec(exit.duration * 0.75),
        }),
      })}>${stemMarkup}</g>`;
    }

    // ---- Sway ----
    let inner = stemMarkup + glyphGroup;
    // Wilting stalks stiffen, and wilted ones are still.
    const calm = clamp(1 - u / 0.85, 0, 1);
    if (sway && calm > 0) {
      // One shared period with the phase following position along the path: a slow travelling
      // wave, so neighbours move nearly together instead of swinging into each other.
      const period = sway.period;
      const phase = ((c.s / (fontSize * 10)) * period + r("sway-phase") * period * 0.08) % period;
      const amp = sway.amplitude * (0.8 + 0.4 * r("sway-amp")) * calm;
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
    charsOut.push({ s: c.s, base, inner, calm });

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
        if (grow) {
          markup = `<g${attrs({
            class: `${p}-fade`,
            style: style({ "animation-delay": at(growEnd + sr() * 0.5) }),
          })}>${markup}</g>`;
        }
        if (exit) {
          markup = `<g${attrs({
            class: `${p}-vanish`,
            style: style({
              "animation-delay": at(exitAt + sr() * 0.2),
              "animation-duration": sec(exit.duration * 0.5),
            }),
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
      wilt: clamp(u, 0, 1),
      outline: glyphHull(q),
    });
  });

  // ---- Assemble characters (with optional travelling gust) ----
  const charGroups = charsOut.map((c) => {
    if (!wave || !c.calm) return `<g class="${p}-c">${c.inner}</g>`;
    const gustDelay = growEndAll + (c.s / sampler.length) * wave.travel;
    return `<g class="${p}-c"><g${attrs({
      class: `${p}-gust`,
      style: style({
        "--g": `${fmt(wave.amplitude * c.calm)}deg`,
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
      class: pathGrow ? `${p}-reveal` : undefined,
      d: sampler.data,
      fill: "none",
      stroke: pathStyle.color ?? stemColor,
      "stroke-width": pathStyle.width,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      opacity: pathStyle.opacity === 1 ? undefined : pathStyle.opacity,
      pathLength: pathGrow ? 1 : undefined,
      "stroke-dasharray": pathGrow ? "1 1" : undefined,
      style: pathGrow
        ? style({
            "animation-delay": at(pathGrow.delay),
            "animation-duration": sec(Math.max(0.01, pathGrow.pathDuration)),
          })
        : undefined,
    })}/>`;
  }

  const title = o.title === false ? null : (o.title ?? o.text);
  const animated = Boolean(grow || sway || exit);
  const body =
    `<g class="${p}-chars">${charGroups.join("")}</g>` +
    (sporesOut.length ? `<g class="${p}-spores">${sporesOut.join("")}</g>` : "");
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
    (animated ? `<style>${css(p, Boolean(exit || incoming?.exitCss))}</style>` : "") +
    (o.background ? `<rect width="100%" height="100%" fill="${esc(o.background)}"/>` : "") +
    pathMarkup +
    body +
    `</svg>`;

  return {
    result: {
      svg,
      fontSize,
      pathLength: sampler.length,
      characters: placed,
      growDuration: grow ? growEndAll + 0.5 : 0,
    },
    body,
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
