import opentype from "opentype.js";
import { type Point, convexHull, simplifyHull } from "./geometry.ts";

const rectHull = (x1: number, y1: number, x2: number, y2: number): Point[] => [
  { x: x1, y: y1 },
  { x: x2, y: y1 },
  { x: x2, y: y2 },
  { x: x1, y: y2 },
];

/**
 * Glyph caches are keyed by font size, and sizes shrunk to fit are arbitrary fractions, so a
 * long-lived font would otherwise keep every glyph at every size it was ever drawn at.
 */
const GLYPH_CACHE_LIMIT = 2048;

/** Look up a cached glyph, marking it recently used. */
function cacheGet(cache: Map<string, GlyphInfo>, key: string): GlyphInfo | undefined {
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
  }
  return hit;
}

/** Cache a glyph, evicting the least recently used once the cache is full. */
function cacheSet(cache: Map<string, GlyphInfo>, key: string, info: GlyphInfo): void {
  cache.set(key, info);
  if (cache.size > GLYPH_CACHE_LIMIT) cache.delete(cache.keys().next().value!);
}

/** How a glyph is drawn in the output SVG. */
export type GlyphShape =
  | { kind: "path"; d: string }
  /** Text glyphs carry the font attributes to put on their `<text>` element. */
  | { kind: "text"; char: string; attrs: Record<string, string> };

/** Glyph metrics in output units (y down, baseline at 0, origin at the pen position). */
export interface GlyphInfo {
  /** Horizontal advance, without kerning. */
  advance: number;
  /** Ink bounds, if known. */
  bounds: { x1: number; y1: number; x2: number; y2: number } | null;
  /** The lowest point of the glyph's ink (largest y), if known. */
  inkBottom: { x: number; y: number } | null;
  /** Convex hull of the glyph's ink, used to keep neighbouring glyphs from overlapping. */
  hull: Point[] | null;
  shape: GlyphShape;
}

/** Abstraction over font sources: parsed font files and CSS font families. */
export interface FontAdapter {
  readonly kind: "path" | "text";
  glyph(char: string, fontSize: number): GlyphInfo;
  kerning(left: string, right: string, fontSize: number): number;
  /** Whether the font can draw this character itself (defaults to true). */
  hasGlyph?(char: string): boolean;
}

/** Colour emoji fonts, tried in order. */
export const EMOJI_FONT_FAMILY =
  '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", "Segoe UI Symbol", sans-serif';

/**
 * Whether a character (grapheme cluster) should be drawn as a colour emoji: anything with emoji
 * presentation, flags, keycaps, skin-tone and ZWJ sequences, or an explicit emoji variation
 * selector. Symbols like © or ™ that default to text presentation are left to the main font.
 */
export function isEmoji(char: string): boolean {
  if (char.includes("\uFE0E")) return false;
  return /\p{Emoji_Presentation}|\p{Regional_Indicator}|\p{Emoji_Modifier}|\uFE0F|\u20E3|\u200D/u.test(
    char,
  );
}

/** A CSS font, rendered with `<text>` elements. The font must be available where the SVG is shown. */
export interface CssFont {
  family: string;
  weight?: string | number;
  style?: string;
}

/** A parsed font file whose glyph outlines are embedded as `<path>` elements. */
export class GrowFont implements FontAdapter {
  readonly kind = "path" as const;
  readonly font: opentype.Font;
  private readonly cache = new Map<string, GlyphInfo>();

  constructor(font: opentype.Font) {
    this.font = font;
  }

  hasGlyph(char: string): boolean {
    const cps = Array.from(char);
    // Multi-code-point clusters (combining marks aside) need shaping opentype.js doesn't do.
    if (cps.length !== 1 && !cps.slice(1).every((c) => /\p{M}/u.test(c))) return false;
    return this.font.charToGlyphIndex(cps[0]!) > 0;
  }

  get familyName(): string {
    return this.font.names.fontFamily?.en ?? "font";
  }

  glyph(char: string, fontSize: number): GlyphInfo {
    const key = `${fontSize}|${char}`;
    const hit = cacheGet(this.cache, key);
    if (hit) return hit;
    const g = this.font.charToGlyph(char);
    const unit = fontSize / this.font.unitsPerEm;
    const path = g.getPath(0, 0, fontSize);
    const d = path.toPathData(2);
    const bb = path.getBoundingBox();
    const hasInk = path.commands.length > 0 && bb.x2 > bb.x1;
    const outline = hasInk ? sampleOutline(path.commands) : [];
    const info: GlyphInfo = {
      advance: (g.advanceWidth ?? 0) * unit,
      bounds: hasInk ? { x1: bb.x1, y1: bb.y1, x2: bb.x2, y2: bb.y2 } : null,
      inkBottom: hasInk ? lowestInk(outline, fontSize) : null,
      hull: hasInk ? simplifyHull(convexHull(outline), 16) : null,
      shape: { kind: "path", d },
    };
    cacheSet(this.cache, key, info);
    return info;
  }

  kerning(left: string, right: string, fontSize: number): number {
    const a = this.font.charToGlyph(left);
    const b = this.font.charToGlyph(right);
    return (this.font.getKerningValue(a, b) * fontSize) / this.font.unitsPerEm;
  }
}

type Cmd = opentype.PathCommand;

/** Find the lowest point of a glyph outline by sampling its curves. */
function sampleOutline(commands: Cmd[]): Point[] {
  const samples: Point[] = [];
  let cx = 0;
  let cy = 0;
  for (const c of commands) {
    if (c.type === "M" || c.type === "L") {
      samples.push({ x: c.x, y: c.y });
      cx = c.x;
      cy = c.y;
    } else if (c.type === "Q") {
      for (let t = 0.125; t <= 1; t += 0.125) {
        const mt = 1 - t;
        samples.push({
          x: mt * mt * cx + 2 * mt * t * c.x1 + t * t * c.x,
          y: mt * mt * cy + 2 * mt * t * c.y1 + t * t * c.y,
        });
      }
      cx = c.x;
      cy = c.y;
    } else if (c.type === "C") {
      for (let t = 0.125; t <= 1; t += 0.125) {
        const mt = 1 - t;
        samples.push({
          x: mt * mt * mt * cx + 3 * mt * mt * t * c.x1 + 3 * mt * t * t * c.x2 + t * t * t * c.x,
          y: mt * mt * mt * cy + 3 * mt * mt * t * c.y1 + 3 * mt * t * t * c.y2 + t * t * t * c.y,
        });
      }
      cx = c.x;
      cy = c.y;
    }
  }
  return samples;
}

/** The lowest point of a glyph outline (from sampled outline points). */
function lowestInk(samples: Point[], fontSize: number): Point {
  let maxY = -Infinity;
  for (const s of samples) maxY = Math.max(maxY, s.y);
  // Average x over the points that sit near the bottom, so flat feet attach in their middle.
  const tol = fontSize * 0.02;
  let sx = 0;
  let n = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  for (const s of samples) {
    if (s.y >= maxY - tol) {
      minX = Math.min(minX, s.x);
      maxX = Math.max(maxX, s.x);
      sx += s.x;
      n++;
    }
  }
  // For a wide flat bottom (e.g. serifs on two feet) use the centre of the bottom span.
  const x = maxX - minX > fontSize * 0.25 ? (minX + maxX) / 2 : sx / n;
  return { x, y: maxY };
}

/** Parse a font file (TTF / OTF / WOFF) from bytes. */
export function parseFont(data: ArrayBuffer | Uint8Array): GrowFont {
  const buffer =
    data instanceof Uint8Array
      ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
      : data;
  return new GrowFont(opentype.parse(buffer as ArrayBuffer));
}

/** Load a font file from a URL, or parse it from bytes. */
export async function loadFont(source: string | URL | ArrayBuffer | Uint8Array): Promise<GrowFont> {
  if (typeof source === "string" || source instanceof URL) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`growtype: failed to load font ${String(source)} (${res.status})`);
    return parseFont(await res.arrayBuffer());
  }
  return parseFont(source);
}

type Ctx2D = Pick<CanvasRenderingContext2D, "font" | "measureText">;

let sharedCtx: Ctx2D | null | undefined;
function getContext(): Ctx2D | null {
  if (sharedCtx !== undefined) return sharedCtx;
  sharedCtx = null;
  try {
    if (typeof OffscreenCanvas !== "undefined") {
      sharedCtx = new OffscreenCanvas(1, 1).getContext("2d") as Ctx2D | null;
    } else if (typeof document !== "undefined") {
      sharedCtx = document.createElement("canvas").getContext("2d");
    }
  } catch {
    sharedCtx = null;
  }
  return sharedCtx;
}

function cssFamily(family: string): string {
  // Leave generic families and already-quoted / comma lists alone.
  if (
    /[,'"]/.test(family) ||
    /^(serif|sans-serif|monospace|cursive|fantasy|system-ui)$/.test(family)
  ) {
    return family;
  }
  return `"${family}"`;
}

/**
 * A CSS font family, measured with a canvas. Glyphs are emitted as `<text>`,
 * so ink positions are approximate and the font must be loaded where the SVG is displayed.
 */
export class CssFontAdapter implements FontAdapter {
  readonly kind = "text" as const;
  readonly spec: Required<CssFont>;
  private readonly cache = new Map<string, GlyphInfo>();

  constructor(spec: CssFont | string) {
    const s = typeof spec === "string" ? { family: spec } : spec;
    this.spec = { family: s.family, weight: s.weight ?? "normal", style: s.style ?? "normal" };
  }

  private fontString(fontSize: number): string {
    return `${this.spec.style} ${this.spec.weight} ${fontSize}px ${cssFamily(this.spec.family)}`;
  }

  private measure(text: string, fontSize: number) {
    const ctx = getContext();
    if (!ctx) return null;
    ctx.font = this.fontString(fontSize);
    return ctx.measureText(text);
  }

  glyph(char: string, fontSize: number): GlyphInfo {
    const key = `${fontSize}|${char}`;
    const hit = cacheGet(this.cache, key);
    if (hit) return hit;
    const m = this.measure(char, fontSize);
    let info: GlyphInfo;
    if (m) {
      const x1 = -(m.actualBoundingBoxLeft ?? 0);
      const x2 = m.actualBoundingBoxRight ?? m.width;
      const y1 = -(m.actualBoundingBoxAscent ?? fontSize * 0.7);
      const y2 = m.actualBoundingBoxDescent ?? 0;
      const hasInk = x2 > x1 && y2 > y1;
      info = {
        advance: m.width,
        bounds: hasInk ? { x1, y1, x2, y2 } : null,
        inkBottom: hasInk ? { x: (x1 + x2) / 2, y: y2 } : null,
        hull: hasInk ? rectHull(x1, y1, x2, y2) : null,
        shape: { kind: "text", char, attrs: this.textAttributes(fontSize) },
      };
    } else {
      // No canvas available: rough estimates (emoji are roughly square, about 1em wide).
      const w = fontSize * (isEmoji(char) ? 1.1 : 0.55);
      const h = fontSize * (isEmoji(char) ? 0.9 : 0.7);
      info = {
        advance: w,
        bounds: { x1: 0, y1: -h, x2: w, y2: 0 },
        inkBottom: { x: w / 2, y: 0 },
        hull: rectHull(0, -h, w, 0),
        shape: { kind: "text", char, attrs: this.textAttributes(fontSize) },
      };
    }
    cacheSet(this.cache, key, info);
    return info;
  }

  kerning(left: string, right: string, fontSize: number): number {
    const pair = this.measure(left + right, fontSize);
    if (!pair) return 0;
    const a = this.glyph(left, fontSize).advance;
    const b = this.glyph(right, fontSize).advance;
    const k = pair.width - a - b;
    return Math.abs(k) < 0.01 ? 0 : k;
  }

  textAttributes(fontSize: number): Record<string, string> {
    const attrs: Record<string, string> = {
      "font-family": this.spec.family,
      "font-size": String(fontSize),
    };
    if (String(this.spec.weight) !== "normal") attrs["font-weight"] = String(this.spec.weight);
    if (this.spec.style !== "normal") attrs["font-style"] = this.spec.style;
    return attrs;
  }
}

export type FontInput = GrowFont | FontAdapter | CssFont | string;

/**
 * Routes emoji – and any character the primary font can't draw – to a fallback font
 * (by default the system colour emoji fonts), so they can appear anywhere in the text.
 */
export class FallbackFontAdapter implements FontAdapter {
  readonly kind: "path" | "text";
  readonly primary: FontAdapter;
  readonly fallback: FontAdapter;
  /** Size of fallback glyphs relative to the font size. */
  readonly scale: number;

  constructor(primary: FontAdapter, fallback: FontAdapter, scale = 1) {
    this.primary = primary;
    this.fallback = fallback;
    this.scale = scale;
    this.kind = primary.kind;
  }

  private usesFallback(char: string): boolean {
    if (/^\s$/u.test(char)) return false;
    return isEmoji(char) || !(this.primary.hasGlyph?.(char) ?? true);
  }

  glyph(char: string, fontSize: number): GlyphInfo {
    return this.usesFallback(char)
      ? this.fallback.glyph(char, fontSize * this.scale)
      : this.primary.glyph(char, fontSize);
  }

  kerning(left: string, right: string, fontSize: number): number {
    if (this.usesFallback(left) || this.usesFallback(right)) return 0;
    return this.primary.kerning(left, right, fontSize);
  }
}

export function toFontAdapter(
  font: FontInput,
  fallback: CssFont | string = EMOJI_FONT_FAMILY,
  emojiScale = 1,
): FontAdapter {
  const primary =
    typeof font === "string"
      ? new CssFontAdapter(font)
      : "glyph" in font && typeof font.glyph === "function"
        ? font
        : new CssFontAdapter(font as CssFont);
  if (primary instanceof FallbackFontAdapter) return primary;
  return new FallbackFontAdapter(primary, new CssFontAdapter(fallback), emojiScale);
}
