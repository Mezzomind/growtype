import { WILT_STAGES, pathInputToData, wiltIndex } from "growtype";
import type { GrowtypeConfig } from "growtype-react";
import { FONT_CHOICES, PALETTES, PATH_PRESETS } from "./presets.ts";
import type { Settings } from "./settings.ts";

const BASE = import.meta.env.BASE_URL;

/**
 * The playground's settings as a plain-JSON `GrowtypeConfig` – exactly the props `<Growtype>`
 * takes, so it can be pasted straight into an app.
 */
export function toConfig(s: Settings, pathData: string): GrowtypeConfig {
  const choice = FONT_CHOICES.find((c) => c.label === s.fontChoice);
  const font: Pick<GrowtypeConfig, "font" | "fontUrl"> = choice?.css
    ? { font: choice.css }
    : { fontUrl: choice?.file ? BASE + choice.file : "/fonts/your-font.ttf" };
  return {
    text: s.text,
    ...font,
    path: pathData,
    width: s.width,
    height: s.height,
    fontSize: s.fontSize,
    letterSpacing: s.letterSpacing,
    layout: s.layout,
    justify: s.justify,
    inset: s.inset,
    side: s.side,
    anchor: s.anchor,
    compensateCurvature: s.compensateCurvature,
    avoidOverlap: s.avoidOverlap,
    baseSpacing: s.baseSpacing,
    stemLength: s.stemLength,
    stemLengthVariance: s.stemLengthVariance,
    stemThickness: s.stemThickness,
    flare: s.flare,
    wobble: s.wobble,
    stemVariance: s.stemVariance,
    tilt: [Math.min(s.tiltMin, s.tiltMax), Math.max(s.tiltMin, s.tiltMax)],
    tiltCoherence: s.tiltCoherence,
    twist: s.twist,
    wilt: s.wilt,
    seed: s.seed,
    grow: s.grow && { duration: s.growDuration, stagger: s.growStagger, order: s.growOrder },
    sway: s.sway && {
      amplitude: s.swayAmplitude,
      period: s.swayPeriod,
      wave: s.wave && { amplitude: s.waveAmplitude },
    },
    blastOnWiltChange: s.blastOnWilt && { direction: s.blastFrom, strength: s.blastStrength },
    glyphColor: s.glyphColor,
    ...(PALETTES[s.palette] ? { palette: PALETTES[s.palette]! } : {}),
    stemColor: s.stemColor,
    showPath: s.showPath && { color: s.pathColor, width: s.pathWidth },
    spores: s.spores && { count: s.sporeCount, size: s.sporeSize },
    ...(s.transparent ? {} : { background: s.background }),
  };
}

/** A copy-pasteable React component using the config. */
export function toReactSnippet(config: GrowtypeConfig): string {
  return `import { Growtype } from "growtype-react";

const config = ${JSON.stringify(config, null, 2)} as const;

export function Sprouts() {
  return <Growtype {...config} />;
}
`;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
const str = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
  options.includes(v as T) ? (v as T) : fallback;

/**
 * Apply a pasted config (JSON text) on top of the current settings. Anything missing keeps its
 * current value; anything the playground can't represent is reported in `notes`.
 */
export function fromConfig(
  json: string,
  current: Settings,
): { settings: Settings; notes: string[] } | { error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    return { error: `Not valid JSON: ${(e as Error).message}` };
  }
  if (!isObj(raw)) return { error: "Expected a JSON object of growtype settings." };
  const c = raw;
  const notes: string[] = [];
  const s: Settings = { ...current };

  s.text = str(c.text, s.text);
  s.width = num(c.width, s.width);
  s.height = num(c.height, s.height);

  // Font: match a bundled font file or CSS family.
  if (typeof c.fontUrl === "string") {
    const file = c.fontUrl.split("/").pop();
    const match = FONT_CHOICES.find((f) => f.file?.endsWith(`/${file}`));
    if (match) s.fontChoice = match.label;
    else notes.push(`Font file "${c.fontUrl}" isn't bundled here – upload it to preview it.`);
  } else if (c.font !== undefined) {
    const family = typeof c.font === "string" ? c.font : isObj(c.font) ? c.font.family : undefined;
    const match = FONT_CHOICES.find((f) => f.css === family);
    if (match) s.fontChoice = match.label;
    else notes.push(`CSS font "${String(family)}" isn't one of the playground's fonts.`);
  }

  // Path: data string or points; keep the preset if it's an unedited one at this size.
  if (typeof c.path === "string" || Array.isArray(c.path)) {
    try {
      const d = pathInputToData(c.path as string);
      const preset = PATH_PRESETS.find((p) => p.build(s.width, s.height) === d);
      s.path = preset ? { kind: "preset", name: preset.name } : { kind: "custom", d };
    } catch {
      notes.push("Couldn't read the path; kept the current one.");
    }
  }

  s.fontSize = num(c.fontSize, s.fontSize);
  s.letterSpacing = num(c.letterSpacing, s.letterSpacing);
  s.layout = oneOf(c.layout, ["natural", "fill"] as const, s.layout);
  s.justify = oneOf(c.justify, ["start", "center", "end"] as const, s.justify);
  s.inset = num(c.inset, s.inset);
  s.side = oneOf(c.side, ["left", "right"] as const, s.side);
  s.anchor = oneOf(c.anchor, ["baseline", "ink"] as const, s.anchor);
  s.compensateCurvature = bool(c.compensateCurvature, s.compensateCurvature);
  s.avoidOverlap = bool(c.avoidOverlap, s.avoidOverlap);
  s.baseSpacing = num(c.baseSpacing, s.baseSpacing);
  s.stemLength = num(c.stemLength, s.stemLength);
  s.stemLengthVariance = num(c.stemLengthVariance, s.stemLengthVariance);
  s.stemThickness = num(c.stemThickness, s.stemThickness);
  s.flare = num(c.flare, s.flare);
  s.wobble = num(c.wobble, s.wobble);
  s.stemVariance = num(c.stemVariance, s.stemVariance);
  if (typeof c.tilt === "number") [s.tiltMin, s.tiltMax] = [-c.tilt, c.tilt];
  else if (Array.isArray(c.tilt))
    [s.tiltMin, s.tiltMax] = [num(c.tilt[0], s.tiltMin), num(c.tilt[1], s.tiltMax)];
  s.tiltCoherence = num(c.tiltCoherence, s.tiltCoherence);
  s.twist = num(c.twist, s.twist);
  if (c.wilt !== undefined) s.wilt = WILT_STAGES[Math.round(wiltIndex(c.wilt as never))]!;
  s.seed = num(c.seed, s.seed);

  if (c.grow !== undefined) {
    s.grow = Boolean(c.grow);
    if (isObj(c.grow)) {
      s.growDuration = num(c.grow.duration, s.growDuration);
      s.growStagger = num(c.grow.stagger, s.growStagger);
      s.growOrder = oneOf(
        c.grow.order,
        ["auto", "start", "end", "center", "random"] as const,
        s.growOrder,
      );
    }
  }
  if (c.sway !== undefined) {
    s.sway = Boolean(c.sway);
    if (isObj(c.sway)) {
      s.swayAmplitude = num(c.sway.amplitude, s.swayAmplitude);
      s.swayPeriod = num(c.sway.period, s.swayPeriod);
      s.wave = Boolean(c.sway.wave);
      if (isObj(c.sway.wave)) s.waveAmplitude = num(c.sway.wave.amplitude, s.waveAmplitude);
    } else s.wave = false;
  }
  if (c.blastOnWiltChange !== undefined) {
    s.blastOnWilt = Boolean(c.blastOnWiltChange);
    if (isObj(c.blastOnWiltChange)) {
      s.blastFrom = oneOf(c.blastOnWiltChange.direction, ["left", "right"] as const, s.blastFrom);
      s.blastStrength = num(c.blastOnWiltChange.strength, s.blastStrength);
    }
  }

  s.glyphColor = str(c.glyphColor, s.glyphColor);
  s.stemColor = str(c.stemColor, s.stemColor);
  if (Array.isArray(c.palette)) {
    const name = Object.entries(PALETTES).find(
      ([, p]) => p && JSON.stringify(p) === JSON.stringify(c.palette),
    )?.[0];
    if (name) s.palette = name;
    else notes.push("Custom palettes aren't editable here; using no palette.");
  } else if ("palette" in c || "glyphColor" in c) s.palette = "None";
  if (c.showPath !== undefined) {
    s.showPath = Boolean(c.showPath);
    if (isObj(c.showPath)) {
      s.pathColor = str(c.showPath.color, s.pathColor);
      s.pathWidth = num(c.showPath.width, s.pathWidth);
    }
  }
  if (c.spores !== undefined) {
    s.spores = Boolean(c.spores);
    if (isObj(c.spores)) {
      s.sporeCount = num(c.spores.count, s.sporeCount);
      s.sporeSize = num(c.spores.size, s.sporeSize);
    }
  }
  if (typeof c.background === "string") {
    s.background = c.background;
    s.transparent = false;
  } else if ("text" in c) s.transparent = true; // a full config without a background
  return { settings: s, notes };
}
