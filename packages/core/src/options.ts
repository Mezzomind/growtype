import type { CssFont, FontInput } from "./font.ts";
import type { PathInput } from "./path.ts";

export type Justify = "start" | "center" | "end";
export type LayoutMode = "natural" | "fill";
export type AnchorMode = "baseline" | "ink";
export type WiltStage = "full" | "slightly-damaged" | "damaged" | "wilted";
export const WILT_STAGES: readonly WiltStage[] = ["full", "slightly-damaged", "damaged", "wilted"];

export interface GrowOptions {
  /** Seconds for a single character to sprout (base, stem, glyph). Default 1.2. */
  duration?: number;
  /** Seconds between consecutive characters starting to grow. Default 0.09. */
  stagger?: number;
  /** Seconds before anything starts. Default 0. */
  delay?: number;
  /** Order in which characters sprout. `auto` follows the justification. Default `auto`. */
  order?: "auto" | "start" | "end" | "center" | "random";
  /** Seconds spent drawing the substrate path before sprouting (only when `showPath`). Default 0.6. */
  pathDuration?: number;
}

export interface WaveOptions {
  /** Peak gust lean in degrees. Default 6. */
  amplitude?: number;
  /** Seconds for the gust to travel the full path. Default 2.5. */
  travel?: number;
  /** Seconds between gusts (must be ≥ travel to read as separate gusts). Default 5. */
  period?: number;
}

export interface SwayOptions {
  /** Peak lean in degrees, jittered per character. Default 3. */
  amplitude?: number;
  /** Seconds per sway cycle, jittered per character. Default 3.2. */
  period?: number;
  /** Add a coherent gust of wind travelling along the path. Default false. */
  wave?: boolean | WaveOptions;
}

export interface BlastOptions {
  /** Which side of the text the shock wave comes from. Default `left`. */
  direction?: "left" | "right";
  /** Seconds on the animation timeline when the blast starts. Default 0. */
  at?: number;
  /** Seconds for the front to sweep across the whole text. Default 1.1. */
  duration?: number;
  /** How far sprouts are knocked over, in degrees. Default 22. */
  strength?: number;
  /** Seconds for a sprout to recoil and settle after being hit. Default 1.6. */
  recoil?: number;
  /** Debris particles thrown off each sprout. Default 3. */
  debris?: number;
  /** Colour of the debris. Defaults to the stem colour. */
  color?: string;
  /**
   * The wilt stage before the blast. Each sprout shows this until the front reaches it, then
   * changes to `wilt`. Evaluated at `timeOffset`, so re-render while the blast plays to see it sweep.
   */
  fromWilt?: WiltStage | number;
  /**
   * A blast still playing when this one started (its target wilt is this blast's `fromWilt`).
   * Each sprout carries on wherever that blast has it until this front arrives, so a wave fired
   * mid-wave picks every sprout up from where it is; both knock-backs play out.
   */
  interrupts?: BlastOptions;
}

export interface SporeOptions {
  /** Average spores per character. Default 2.5. */
  count?: number;
  /** Spore radius. Default 1.4. */
  size?: number;
  /** Spore colour. Defaults to the stem colour. */
  color?: string;
  /** How far spores float from the glyph, as a fraction of font size. Default 0.9. */
  spread?: number;
}

export interface PathStyle {
  color?: string;
  width?: number;
  opacity?: number;
}

export interface GrowtypeOptions {
  /**
   * The text to grow. Emoji may appear anywhere: they are kept whole (ZWJ sequences, flags,
   * skin tones, keycaps) and drawn with a colour emoji font when the main font lacks them.
   */
  text: string;
  /**
   * A parsed font file (`await loadFont(url)`) to embed glyphs as paths,
   * or a CSS font family / `{ family, weight, style }` to emit `<text>`.
   */
  font: FontInput;
  /**
   * Font for emoji and for any character the main font file can't draw. Rendered as `<text>`.
   * Default: the system colour emoji fonts (Apple / Segoe UI / Noto Color Emoji).
   */
  emojiFont?: CssFont | string;
  /** Size of emoji relative to `fontSize`. Default 0.9. */
  emojiScale?: number;
  /** SVG path data, or a list of points that is smoothed into a curve. */
  path: PathInput;
  /** SVG width (and viewBox width). Path coordinates are in this space. */
  width: number;
  /** SVG height (and viewBox height). */
  height: number;

  /** Font size in user units. Default 48. */
  fontSize?: number;
  /** Extra spacing between characters in natural layout. Default 0. */
  letterSpacing?: number;
  /** `natural` packs characters; `fill` spreads them across the whole path. Default `natural`. */
  layout?: LayoutMode;
  /**
   * Where the text sits along the path in natural layout. `start` lays the first character at the
   * start of the path and continues forwards; `end` puts the last character at the end of the path
   * and works backwards to the first; `center` centres it. Default `start`.
   */
  justify?: Justify;
  /** Distance kept clear at both ends of the path. Default 0. */
  inset?: number;
  /** Which side of the path characters grow on, relative to its direction. Default `left` (up for a left→right path). */
  side?: "left" | "right";
  /**
   * Space characters along the curve their glyphs sit on (offset by the stem length) rather than
   * the path itself, so they don't bunch up in hollows or spread apart over bumps. Default true.
   */
  compensateCurvature?: boolean;
  /** Where the stem attaches: the glyph's baseline centre, or its lowest point of ink. Default `baseline`. */
  anchor?: AnchorMode;

  /** Stem length in user units. Default 36. */
  stemLength?: number;
  /** Random ± fraction applied to stem length per character. Default 0.35. */
  stemLengthVariance?: number;
  /** Stem thickness at its narrowest. Default 2.2. */
  stemThickness?: number;
  /** How much wider the base flare is than the stem. Default 3. */
  flare?: number;
  /** How organic / irregular stems are, 0–1+. Default 0.6. */
  wobble?: number;
  /**
   * How much stalks differ from one another, 0–1+: thickness, foot size and lopsidedness, C/S
   * bows, nodal swellings, knob size, tone and the odd side branch with a spore head. Default 0.7.
   */
  stemVariance?: number;

  /** Max lean in degrees, either ±n or an explicit [min, max] range. Default 18. */
  tilt?: number | readonly [number, number];
  /** 0–1: how much neighbouring characters lean together (0 = fully independent). Default 0.6. */
  tiltCoherence?: number;
  /** Extra random rotation of each glyph relative to its stem, ± degrees. Default 6. */
  twist?: number;

  /** Seed for all randomness. Same seed + options ⇒ identical SVG. Default 1. */
  seed?: number | string;
  /**
   * Wilt stage: a named stage or 0 (full) – 3 (wilted). Fractions are allowed for tweening between stages.
   * Effects stay subtle so text remains readable. Default `full`.
   */
  wilt?: WiltStage | number;

  /** Animate the characters sprouting. Default false. */
  grow?: boolean | GrowOptions;
  /** Idle sway animation. Default false. */
  sway?: boolean | SwayOptions;
  /**
   * An invisible shock wave sweeping across from the left or right, knocking the sprouts over as
   * it passes.
   * Use it when the wilt stage changes (`fromWilt` → `wilt`). Default none.
   */
  blast?: BlastOptions;
  /**
   * Spacing of stem bases within a word relative to the glyphs, 0–1. Below 1 the bases huddle
   * towards the middle of each word and the stalks fan out to hold the glyphs at their normal
   * spacing, like a tuft. Default 1.
   */
  baseSpacing?: number;
  /** Nudge leans, heights and twists so glyphs don't overlap their neighbours. Default true. */
  avoidOverlap?: boolean;

  /** Glyph colour. Default `#24301a`. */
  glyphColor?: string;
  /** Per-character glyph colours, picked at random (seeded). Overrides `glyphColor`. */
  palette?: readonly string[];
  /** Stem colour. Default `#7c8f55`. */
  stemColor?: string;
  /** Draw the path itself as a substrate line. Default false. */
  showPath?: boolean | PathStyle;
  /** Floating spores around each character. Default false. */
  spores?: boolean | SporeOptions;
  /** Background fill for the whole SVG. Default none. */
  background?: string;
  /**
   * Start the animation timeline this many seconds in. Use it when re-rendering a live SVG so that
   * grow/sway continue where they were instead of restarting. Default 0.
   */
  timeOffset?: number;
  /** Prefix for ids and CSS classes; set when inlining several SVGs with different options. */
  idPrefix?: string;
  /** Add a `<title>` for accessibility. Defaults to the text. */
  title?: string | false;
}

export function wiltIndex(w: GrowtypeOptions["wilt"]): number {
  if (w === undefined) return 0;
  if (typeof w === "number") return Number.isFinite(w) ? Math.max(0, Math.min(3, w)) : 0;
  const i = WILT_STAGES.indexOf(w);
  return i < 0 ? 0 : i;
}

export const DEFAULTS = {
  fontSize: 48,
  emojiScale: 0.9,
  letterSpacing: 0,
  layout: "natural" as LayoutMode,
  justify: "start" as Justify,
  inset: 0,
  side: "left" as "left" | "right",
  anchor: "baseline" as AnchorMode,
  compensateCurvature: true,
  stemLength: 36,
  stemLengthVariance: 0.35,
  stemThickness: 2.2,
  flare: 3,
  wobble: 0.6,
  stemVariance: 0.7,
  tilt: 18,
  tiltCoherence: 0.6,
  twist: 6,
  glyphColor: "#24301a",
  stemColor: "#7c8f55",
  grow: {
    duration: 1.2,
    stagger: 0.09,
    delay: 0,
    order: "auto",
    pathDuration: 0.6,
  } as Required<GrowOptions>,
  sway: { amplitude: 3, period: 3.2 },
  wave: { amplitude: 6, travel: 2.5, period: 5 } as Required<WaveOptions>,
  avoidOverlap: true,
  baseSpacing: 1,
  blast: {
    direction: "left",
    at: 0,
    duration: 1.1,
    strength: 22,
    recoil: 1.6,
    debris: 3,
  } as Required<Omit<BlastOptions, "fromWilt" | "color" | "interrupts">> &
    Pick<BlastOptions, "fromWilt" | "color" | "interrupts">,
  spores: { count: 2.5, size: 1.4, spread: 0.9 },
  path: { width: 2, opacity: 1 },
};
