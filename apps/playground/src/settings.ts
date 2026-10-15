import type { WiltStage } from "growtype";
import { FONT_CHOICES } from "./presets.ts";

export type PathSource = { kind: "preset"; name: string } | { kind: "custom"; d: string };

export interface Settings {
  text: string;
  fontChoice: string;
  width: number;
  height: number;
  path: PathSource;
  fontSize: number;
  letterSpacing: number;
  layout: "natural" | "fill";
  justify: "start" | "center" | "end";
  avoidOverlap: boolean;
  baseSpacing: number;
  blastOnWilt: boolean;
  blastFrom: "left" | "right";
  blastStrength: number;
  inset: number;
  side: "left" | "right";
  anchor: "baseline" | "ink";
  compensateCurvature: boolean;
  stemLength: number;
  stemLengthVariance: number;
  stemThickness: number;
  flare: number;
  wobble: number;
  stemVariance: number;
  tiltMin: number;
  tiltMax: number;
  tiltCoherence: number;
  twist: number;
  wilt: WiltStage;
  seed: number;
  grow: boolean;
  growDuration: number;
  growStagger: number;
  growOrder: "auto" | "start" | "end" | "center" | "random";
  sway: boolean;
  swayAmplitude: number;
  swayPeriod: number;
  wave: boolean;
  waveAmplitude: number;
  glyphColor: string;
  stemColor: string;
  palette: string;
  showPath: boolean;
  pathColor: string;
  pathWidth: number;
  spores: boolean;
  sporeCount: number;
  sporeSize: number;
  background: string;
  transparent: boolean;
}

export const INITIAL: Settings = {
  text: "🍄 spores of 🧠 thought ✨",
  fontChoice: FONT_CHOICES[0]!.label,
  width: 900,
  height: 420,
  path: { kind: "preset", name: "Wave" },
  fontSize: 54,
  letterSpacing: 6,
  layout: "natural",
  justify: "center",
  avoidOverlap: true,
  baseSpacing: 0.7,
  blastOnWilt: true,
  blastFrom: "left",
  blastStrength: 22,
  inset: 20,
  side: "left",
  anchor: "baseline",
  compensateCurvature: true,
  stemLength: 44,
  stemLengthVariance: 0.35,
  stemThickness: 2.4,
  flare: 3,
  wobble: 0.6,
  stemVariance: 0.7,
  tiltMin: -12,
  tiltMax: 12,
  tiltCoherence: 0.7,
  twist: 6,
  wilt: "full",
  seed: 1,
  grow: true,
  growDuration: 1.2,
  growStagger: 0.08,
  growOrder: "auto",
  sway: true,
  swayAmplitude: 3,
  swayPeriod: 3.2,
  wave: false,
  waveAmplitude: 6,
  glyphColor: "#24301a",
  stemColor: "#7c8f55",
  palette: "None",
  showPath: true,
  pathColor: "#7c8f55",
  pathWidth: 2.5,
  spores: true,
  sporeCount: 2.5,
  sporeSize: 1.4,
  background: "#f4efe3",
  transparent: false,
};

export const WILT_LABELS: Record<WiltStage, string> = {
  full: "Full",
  "slightly-damaged": "Slightly damaged",
  damaged: "Damaged",
  wilted: "Wilted",
};
