export interface PathPreset {
  name: string;
  /** Build path data for a canvas of the given size. */
  build: (w: number, h: number) => string;
}

const f = (n: number) => Math.round(n * 10) / 10;

export const PATH_PRESETS: PathPreset[] = [
  {
    name: "Wave",
    build: (w, h) =>
      `M ${f(w * 0.06)} ${f(h * 0.7)} C ${f(w * 0.3)} ${f(h * 0.45)}, ${f(w * 0.55)} ${f(h * 0.95)}, ${f(w * 0.94)} ${f(h * 0.62)}`,
  },
  {
    name: "Hill",
    build: (w, h) =>
      `M ${f(w * 0.05)} ${f(h * 0.85)} Q ${f(w * 0.5)} ${f(h * 0.1)} ${f(w * 0.95)} ${f(h * 0.85)}`,
  },
  {
    name: "Valley",
    build: (w, h) =>
      `M ${f(w * 0.05)} ${f(h * 0.35)} Q ${f(w * 0.5)} ${f(h * 1.2)} ${f(w * 0.95)} ${f(h * 0.35)}`,
  },
  {
    name: "Line",
    build: (w, h) => `M ${f(w * 0.05)} ${f(h * 0.75)} L ${f(w * 0.95)} ${f(h * 0.75)}`,
  },
  {
    name: "Circle",
    build: (w, h) => {
      const r = Math.min(w, h) * 0.3;
      const cx = w / 2;
      const cy = h / 2 + r * 0.15;
      return `M ${f(cx - r)} ${f(cy)} a ${f(r)} ${f(r)} 0 1 1 ${f(2 * r)} 0 a ${f(r)} ${f(r)} 0 1 1 ${f(-2 * r)} 0`;
    },
  },
  {
    name: "Spiral",
    build: (w, h) => {
      const cx = w / 2;
      const cy = h / 2;
      const max = Math.min(w, h) * 0.42;
      const pts: string[] = [];
      const turns = 2.25;
      for (let i = 0; i <= 160; i++) {
        const t = i / 160;
        const a = Math.PI + t * turns * Math.PI * 2;
        const r = max * (1 - t * 0.78);
        pts.push(`${f(cx + Math.cos(a) * r)} ${f(cy + Math.sin(a) * r)}`);
      }
      return `M ${pts[0]} L ${pts.slice(1).join(" ")}`;
    },
  },
  {
    name: "Zigzag",
    build: (w, h) => {
      const pts: string[] = [];
      for (let i = 0; i <= 6; i++) {
        pts.push(`${f(w * (0.05 + (0.9 * i) / 6))} ${f(h * (i % 2 ? 0.55 : 0.8))}`);
      }
      return `M ${pts[0]} L ${pts.slice(1).join(" ")}`;
    },
  },
];

export const PALETTES: Record<string, string[] | null> = {
  None: null,
  Lichen: ["#3e4a2b", "#5c6b3a", "#8a8c3e", "#a6743a"],
  Penicillium: ["#2f5d62", "#4f8a8b", "#7fb0a6", "#3b4a6b"],
  Slime: ["#b8860b", "#d4a017", "#8f6b10", "#c96a1b"],
  Bruise: ["#4a2c4f", "#6d3b6e", "#8c4b6b", "#3c2a4d"],
};

export interface FontChoice {
  label: string;
  /** A bundled font file, rendered as glyph paths. */
  file?: string;
  /** A CSS family, rendered as <text>. */
  css?: string;
}

export const FONT_CHOICES: FontChoice[] = [
  { label: "Young Serif (paths)", file: "fonts/YoungSerif-Regular.ttf" },
  { label: "Gloock (paths)", file: "fonts/Gloock-Regular.ttf" },
  { label: "Sniglet (paths)", file: "fonts/Sniglet-Regular.ttf" },
  { label: "Young Serif (CSS text)", css: "Young Serif" },
  { label: "Georgia (CSS text)", css: "Georgia" },
  { label: "system-ui (CSS text)", css: "system-ui" },
  { label: "monospace (CSS text)", css: "monospace" },
];
