import { toFontAdapter } from "./font.ts";
import { type Point, add, angleDeg, clamp, fmt, leftNormal, rotate, scale } from "./geometry.ts";
import { layoutText } from "./layout.ts";
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
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function attrs(a: Record<string, string | number | undefined>): string {
  let out = "";
  for (const [k, v] of Object.entries(a)) {
    if (v === undefined) continue;
    out += ` ${k}="${esc(typeof v === "number" ? fmt(v) : v)}"`;
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
    `.${p} .${p}-sway,.${p} .${p}-gust,.${p} .${p}-foot,.${p} .${p}-pop,.${p} .${p}-spore{transform-box:view-box}`,
    `.${p}-foot{animation:${p}-scale-in .4s cubic-bezier(.2,.8,.3,1.2) both}`,
    `.${p}-reveal{animation:${p}-reveal .8s cubic-bezier(.4,0,.3,1) both}`,
    `.${p}-pop{animation:${p}-pop .5s cubic-bezier(.3,.7,.4,1) both}`,
    `.${p}-fade{animation:${p}-fade .8s ease-out both}`,
    `.${p}-sway{animation:${p}-sway 3s ease-in-out infinite}`,
    `.${p}-gust{animation:${p}-gust 5s ease-in-out infinite}`,
    `.${p}-drift{animation:${p}-drift 6s ease-in-out infinite}`,
    `@keyframes ${p}-scale-in{from{transform:scale(0)}to{transform:scale(1)}}`,
    `@keyframes ${p}-reveal{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}`,
    `@keyframes ${p}-pop{0%{transform:scale(0) rotate(-14deg);opacity:0}55%{transform:scale(1.1) rotate(4deg);opacity:1}100%{transform:scale(1) rotate(0)}}`,
    `@keyframes ${p}-fade{from{opacity:0}to{opacity:1}}`,
    `@keyframes ${p}-sway{0%,100%{transform:rotate(0)}25%{transform:rotate(var(--a))}75%{transform:rotate(calc(var(--a) * -1))}}`,
    `@keyframes ${p}-gust{0%{transform:rotate(0)}10%{transform:rotate(var(--g))}22%{transform:rotate(calc(var(--g) * -.35))}32%{transform:rotate(calc(var(--g) * .12))}42%,100%{transform:rotate(0)}}`,
    `@keyframes ${p}-drift{0%,100%{transform:translate(0,0)}50%{transform:translate(var(--dx),var(--dy))}}`,
    `@media (prefers-reduced-motion:reduce){.${p} *{animation:none!important}}`,
  ].join("");
}

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
  const rhizoidCount = o.rhizoids ?? DEFAULTS.rhizoids;
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
          : justify === "right"
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

  const defs: string[] = [];
  const charsOut: Array<{ s: number; base: Point; inner: string }> = [];
  const sporesOut: string[] = [];
  const placed: PlacedCharacter[] = [];
  let growEndAll = 0;

  for (const c of visible) {
    const i = c.index;
    const r = (ch: string) => rng.value(i, ch);
    const base = sampler.pointAt(c.s);
    const tangent = sampler.tangentAt(c.s);
    const ln = leftNormal(tangent);
    const normal = side === "left" ? ln : scale(ln, -1);

    // Lean, length, wilt.
    // Blend independent jitter with a smooth "field" so neighbours lean together and collide less.
    const leanT = clamp((1 - coherence) * r("tilt") + coherence * leanField(c.s), 0, 1);
    const lean = tiltMin + (tiltMax - tiltMin) * leanT;
    const length = stemLength * shrink * (1 + lengthVar * (r("length") * 2 - 1));
    // Per-character jitter fades in with the first stage so fractional wilt tweens smoothly from 0.
    const u = clamp(wilt / 3 + (r("wilt") - 0.5) * 0.22 * Math.min(1, wilt), 0, 1);
    const droopSign = Math.abs(lean) > 2 ? Math.sign(lean) : r("droop-side") < 0.5 ? -1 : 1;
    const droop = droopSign * u * 13 * (0.75 + 0.5 * r("droop"));
    const phi = lean + droop;
    const tipDir = rotate(normal, phi + droopSign * u * 6 + twist * (r("twist") * 2 - 1));
    const anchorPt = add(base, scale(rotate(normal, phi), length * (1 - 0.12 * u)));
    const glyphScale = 1 - 0.07 * u;
    const rotation = angleDeg(tipDir) + 90;

    const g = c.glyph;
    const anchorLocal =
      anchorMode === "ink" && g.inkBottom ? g.inkBottom : { x: g.advance / 2, y: 0 };
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
      rhizoids: rhizoidCount,
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
    let stemMask: string | undefined;
    if (grow) {
      const id = `${p}-m${i}`;
      const w = (stem.maxHalfWidth + wobble * thickness * shrink * 1.5 + 2) * 2.4;
      defs.push(
        `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${fmt(o.width)}" height="${fmt(o.height)}">` +
          `<path${attrs({
            class: `${p}-reveal`,
            d: stem.centerline,
            fill: "none",
            stroke: "#fff",
            "stroke-width": w,
            pathLength: 1,
            "stroke-dasharray": "1 1",
            style: style({
              "animation-delay": at(delay + dur * 0.1),
              "animation-duration": sec(dur * 0.6),
            }),
          })}/></mask>`,
      );
      stemMask = `url(#${id})`;
    }
    const footStyle = grow
      ? style({
          "transform-origin": origin(base),
          "animation-delay": at(delay),
          "animation-duration": sec(dur * 0.3),
        })
      : undefined;
    const rhizoidMarkup = stem.rhizoids.length
      ? `<g${attrs({ class: grow ? `${p}-foot` : undefined, style: footStyle, fill: "none", stroke: stemColor, "stroke-linecap": "round" })}>` +
        stem.rhizoids
          .map((rz) => `<path${attrs({ d: rz.d, "stroke-width": rz.width })}/>`)
          .join("") +
        `</g>`
      : "";
    const stemAttrs = {
      class: `${p}-stem`,
      fill: stemColor,
      opacity: stem.opacity < 0.995 ? fmt(stem.opacity, 2) : undefined,
      mask: stemMask,
    };
    const stemMarkup =
      stem.shapes.length === 1
        ? `<path${attrs({ ...stemAttrs, d: stem.shapes[0]! })}/>`
        : `<g${attrs(stemAttrs)}>${stem.shapes.map((d) => `<path d="${d}"/>`).join("")}</g>`;

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
    let inner = rhizoidMarkup + stemMarkup + glyphGroup;
    if (sway) {
      const period = sway.period * (0.75 + 0.55 * r("sway-period"));
      const amp = sway.amplitude * (0.6 + 0.8 * r("sway-amp")) * (r("sway-dir") < 0.5 ? -1 : 1);
      const swayDelay = grow ? growEnd : -r("sway-phase") * period;
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

  const title = o.title === false ? null : (o.title ?? o.text);
  const animated = Boolean(grow || sway);
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
    (defs.length ? `<defs>${defs.join("")}</defs>` : "") +
    (o.background ? `<rect width="100%" height="100%" fill="${esc(o.background)}"/>` : "") +
    pathMarkup +
    `<g class="${p}-chars">${charGroups.join("")}</g>` +
    (sporesOut.length ? `<g class="${p}-spores">${sporesOut.join("")}</g>` : "") +
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
