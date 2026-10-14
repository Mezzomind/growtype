import {
  CssFontAdapter,
  type FontAdapter,
  type GrowFont,
  type GrowtypeOptions,
  type Point,
  WILT_STAGES,
  type WiltStage,
  growtype,
  loadFont,
  parseFont,
  pathInputToData,
} from "@growtype/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Color, Section, Segmented, Select, Slider, Toggle } from "./controls.tsx";
import { FONT_CHOICES, PALETTES, PATH_PRESETS } from "./presets.ts";

type PathSource = { kind: "preset"; name: string } | { kind: "custom"; d: string };

interface Settings {
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
  rhizoids: number;
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

const INITIAL: Settings = {
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
  rhizoids: 3,
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

const WILT_LABELS: Record<WiltStage, string> = {
  full: "Full",
  "slightly-damaged": "Slightly damaged",
  damaged: "Damaged",
  wilted: "Wilted",
};

const BASE = import.meta.env.BASE_URL;

function useFonts() {
  const [files, setFiles] = useState<Record<string, GrowFont>>({});
  const [cssReady, setCssReady] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    for (const choice of FONT_CHOICES) {
      if (!choice.file) continue;
      loadFont(BASE + choice.file)
        .then((font) => alive && setFiles((prev) => ({ ...prev, [choice.label]: font })))
        .catch((e: unknown) => alive && setError(String(e)));
    }
    // CSS-mode fonts are measured with a canvas, so wait until web fonts are usable.
    void Promise.all([
      document.fonts.load('48px "Freckle Face"'),
      document.fonts.load('48px "Young Serif"'),
    ]).then(() => alive && setCssReady((n) => n + 1));
    return () => {
      alive = false;
    };
  }, []);

  const addUpload = useCallback(async (file: File) => {
    try {
      const font = parseFont(await file.arrayBuffer());
      const label = `${file.name} (upload)`;
      setFiles((prev) => ({ ...prev, [label]: font }));
      setError(null);
      return label;
    } catch (e) {
      setError(`Could not parse ${file.name}: ${String(e)}`);
      return null;
    }
  }, []);

  return { files, cssReady, error, addUpload };
}

/** Smoothly tween a number towards a target. */
function useTween(target: number, ms = 700): number {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const v0 = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const v = v0 + (target - v0) * e;
      from.current = v;
      setValue(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

export function App() {
  const [s, setS] = useState<Settings>(INITIAL);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setS((prev) => ({ ...prev, [key]: value }));
  const { files, cssReady, error: fontError, addUpload } = useFonts();
  const [drawing, setDrawing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Animation epoch: re-renders continue the timeline from here instead of restarting it.
  const epoch = useRef(performance.now());
  const [replayKey, setReplayKey] = useState(0);

  const wiltTarget = WILT_STAGES.indexOf(s.wilt);
  const tweened = useTween(wiltTarget);
  const timeline = () => (performance.now() - epoch.current) / 1000;

  // Blast wave: when the wilt stage changes, sweep a shock front across the text and re-render
  // every frame while it plays so each sprout wilts as the front reaches it.
  const BLAST_DURATION = 1.1;
  const BLAST_RECOIL = 1.6;
  const [blast, setBlast] = useState<{ at: number; fromWilt: number } | null>(null);
  const [frame, setFrame] = useState(0);
  const prevWilt = useRef(wiltTarget);
  const fireBlast = useCallback((fromWilt: number) => {
    const at = timeline() + 0.05;
    setBlast({ at, fromWilt });
    const end = at + BLAST_DURATION + BLAST_RECOIL + 0.3;
    const tick = () => {
      if (timeline() > end) {
        setBlast(null);
        return;
      }
      setFrame((f) => f + 1);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, []);
  useEffect(() => {
    if (prevWilt.current === wiltTarget) return;
    const from = prevWilt.current;
    prevWilt.current = wiltTarget;
    if (s.blastOnWilt) fireBlast(from);
  }, [wiltTarget, s.blastOnWilt, fireBlast]);
  const wilt = s.blastOnWilt ? wiltTarget : tweened;

  const pathData = useMemo(() => {
    if (s.path.kind === "custom") return s.path.d;
    const name = s.path.name;
    return (PATH_PRESETS.find((p) => p.name === name) ?? PATH_PRESETS[0]!).build(s.width, s.height);
  }, [s.path, s.width, s.height]);

  const font: FontAdapter | null = useMemo(() => {
    const choice = FONT_CHOICES.find((c) => c.label === s.fontChoice);
    if (choice?.css) return new CssFontAdapter({ family: choice.css });
    return files[s.fontChoice] ?? null;
    // cssReady invalidates cached canvas measurements once web fonts load.
  }, [s.fontChoice, files, cssReady]);

  const options: GrowtypeOptions | null = useMemo(() => {
    if (!font) return null;
    return {
      text: s.text,
      font,
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
      rhizoids: s.rhizoids,
      stemVariance: s.stemVariance,
      tilt: [Math.min(s.tiltMin, s.tiltMax), Math.max(s.tiltMin, s.tiltMax)],
      tiltCoherence: s.tiltCoherence,
      twist: s.twist,
      wilt,
      seed: s.seed,
      grow: s.grow && { duration: s.growDuration, stagger: s.growStagger, order: s.growOrder },
      sway: s.sway && {
        amplitude: s.swayAmplitude,
        period: s.swayPeriod,
        wave: s.wave && { amplitude: s.waveAmplitude },
      },
      glyphColor: s.glyphColor,
      palette: PALETTES[s.palette] ?? undefined,
      stemColor: s.stemColor,
      showPath: s.showPath && { color: s.pathColor, width: s.pathWidth },
      spores: s.spores && { count: s.sporeCount, size: s.sporeSize },
      background: s.transparent ? undefined : s.background,
      blast: blast
        ? {
            direction: s.blastFrom,
            at: blast.at,
            duration: BLAST_DURATION,
            recoil: BLAST_RECOIL,
            strength: s.blastStrength,
            fromWilt: blast.fromWilt,
          }
        : undefined,
    };
  }, [s, font, pathData, wilt, blast]);

  const result = useMemo(() => {
    if (!options) return null;
    try {
      void replayKey;
      void frame;
      const timeOffset = (performance.now() - epoch.current) / 1000;
      return { ...growtype({ ...options, timeOffset }), error: null };
    } catch (e) {
      return {
        svg: "",
        error: String(e),
        fontSize: 0,
        growDuration: 0,
        characters: [],
        pathLength: 0,
      };
    }
  }, [options, replayKey, frame]);

  // The exported SVG always starts its timeline from zero, without the transient blast.
  const exportSvg = useCallback(
    () => (options ? growtype({ ...options, blast: undefined }).svg : ""),
    [options],
  );

  const replay = () => {
    epoch.current = performance.now();
    setReplayKey((k) => k + 1);
  };

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1600);
  };

  const download = () => {
    const blob = new Blob([exportSvg()], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `growtype-${s.text.replace(/\W+/g, "-").slice(0, 32) || "text"}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(exportSvg());
    flash("SVG copied");
  };

  const fileInput = useRef<HTMLInputElement>(null);
  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    const label = await addUpload(file);
    if (label) set("fontChoice", label);
  };

  const fontOptions = [
    ...FONT_CHOICES.map((c) => c.label),
    ...Object.keys(files).filter((k) => k.endsWith("(upload)")),
  ];
  const pathName = s.path.kind === "preset" ? s.path.name : "Custom";

  return (
    <div className="app">
      <aside className="panel">
        <header className="brand">
          <h1>growtype</h1>
          <p>Letters sprouting from a path, like mould.</p>
        </header>

        <Section title="Text & font">
          <label className="row stacked">
            <span className="row-label">Text</span>
            <input type="text" value={s.text} onChange={(e) => set("text", e.target.value)} />
          </label>
          <Select
            label="Font"
            value={s.fontChoice}
            options={fontOptions}
            onChange={(v) => set("fontChoice", v)}
          />
          <div className="row">
            <span className="row-label" />
            <button type="button" onClick={() => fileInput.current?.click()}>
              Upload TTF / OTF / WOFF…
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".ttf,.otf,.woff"
              hidden
              onChange={(e) => void onUpload(e.target.files?.[0])}
            />
          </div>
          {fontError && <p className="error">{fontError}</p>}
          <Slider
            label="Font size"
            value={s.fontSize}
            min={12}
            max={140}
            onChange={(v) => set("fontSize", v)}
          />
          <Slider
            label="Letter spacing"
            value={s.letterSpacing}
            min={-10}
            max={40}
            onChange={(v) => set("letterSpacing", v)}
          />
          <Segmented
            label="Anchor"
            value={s.anchor}
            options={["baseline", "ink"] as const}
            onChange={(v) => set("anchor", v)}
          />
        </Section>

        <Section title="Path & layout">
          <Select
            label="Path"
            value={pathName}
            options={[...PATH_PRESETS.map((p) => p.name), "Custom"]}
            onChange={(v) =>
              set(
                "path",
                v === "Custom" ? { kind: "custom", d: pathData } : { kind: "preset", name: v },
              )
            }
          />
          <div className="row">
            <span className="row-label" />
            <button
              type="button"
              className={drawing ? "active" : ""}
              onClick={() => setDrawing((d) => !d)}
            >
              {drawing ? "Drawing… (drag on canvas)" : "✎ Draw a path"}
            </button>
          </div>
          <label className="row stacked">
            <span className="row-label">Path data</span>
            <textarea
              rows={3}
              className="mono"
              value={pathData}
              onChange={(e) => set("path", { kind: "custom", d: e.target.value })}
            />
          </label>
          <Slider
            label="Width"
            value={s.width}
            min={200}
            max={1600}
            step={10}
            onChange={(v) => set("width", v)}
          />
          <Slider
            label="Height"
            value={s.height}
            min={150}
            max={1200}
            step={10}
            onChange={(v) => set("height", v)}
          />
          <Segmented
            label="Layout"
            value={s.layout}
            options={["natural", "fill"] as const}
            labels={{ natural: "Natural", fill: "Fill path" }}
            onChange={(v) => set("layout", v)}
          />
          {s.layout === "natural" && (
            <Segmented
              label="Align"
              value={s.justify}
              options={["start", "center", "end"] as const}
              labels={{ start: "Path start", center: "Center", end: "Path end" }}
              onChange={(v) => set("justify", v)}
            />
          )}
          <Slider
            label="Inset"
            value={s.inset}
            min={0}
            max={200}
            onChange={(v) => set("inset", v)}
          />
          <Segmented
            label="Grow side"
            value={s.side}
            options={["left", "right"] as const}
            labels={{ left: "Left of path", right: "Right of path" }}
            onChange={(v) => set("side", v)}
          />
          <Toggle
            label="Avoid overlaps"
            checked={s.avoidOverlap}
            onChange={(v) => set("avoidOverlap", v)}
          />
          <Toggle
            label="Even out curves"
            checked={s.compensateCurvature}
            onChange={(v) => set("compensateCurvature", v)}
          />
        </Section>

        <Section title="Stems">
          <Slider
            label="Length"
            value={s.stemLength}
            min={0}
            max={200}
            onChange={(v) => set("stemLength", v)}
          />
          <Slider
            label="Length variance"
            value={s.stemLengthVariance}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => set("stemLengthVariance", v)}
          />
          <Slider
            label="Thickness"
            value={s.stemThickness}
            min={0.4}
            max={12}
            step={0.1}
            onChange={(v) => set("stemThickness", v)}
          />
          <Slider
            label="Base flare"
            value={s.flare}
            min={0}
            max={8}
            step={0.1}
            onChange={(v) => set("flare", v)}
          />
          <Slider
            label="Wobble"
            value={s.wobble}
            min={0}
            max={2}
            step={0.01}
            onChange={(v) => set("wobble", v)}
          />
          <Slider
            label="Rhizoids"
            value={s.rhizoids}
            min={0}
            max={8}
            onChange={(v) => set("rhizoids", v)}
          />
          <Slider
            label="Variation"
            value={s.stemVariance}
            min={0}
            max={1.5}
            step={0.01}
            onChange={(v) => set("stemVariance", v)}
          />
          <Slider
            label="Base spacing"
            value={s.baseSpacing}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => set("baseSpacing", v)}
          />
        </Section>

        <Section title="Tilt & wilt">
          <Slider
            label="Tilt min"
            value={s.tiltMin}
            min={-60}
            max={60}
            unit="°"
            onChange={(v) => set("tiltMin", v)}
          />
          <Slider
            label="Tilt max"
            value={s.tiltMax}
            min={-60}
            max={60}
            unit="°"
            onChange={(v) => set("tiltMax", v)}
          />
          <Slider
            label="Tilt coherence"
            value={s.tiltCoherence}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => set("tiltCoherence", v)}
          />
          <Slider
            label="Glyph twist"
            value={s.twist}
            min={0}
            max={45}
            unit="°"
            onChange={(v) => set("twist", v)}
          />
          <Segmented
            label="Wilt"
            value={s.wilt}
            options={WILT_STAGES}
            labels={WILT_LABELS}
            onChange={(v) => set("wilt", v)}
          />
          <Toggle
            label="Blast on change"
            checked={s.blastOnWilt}
            onChange={(v) => set("blastOnWilt", v)}
          />
          {s.blastOnWilt && (
            <>
              <Segmented
                label="Blast from"
                value={s.blastFrom}
                options={["left", "right"] as const}
                labels={{ left: "Left", right: "Right" }}
                onChange={(v) => set("blastFrom", v)}
              />
              <Slider
                label="Blast force"
                value={s.blastStrength}
                min={0}
                max={60}
                unit="°"
                onChange={(v) => set("blastStrength", v)}
              />
            </>
          )}
          <div className="row">
            <span className="row-label">Seed</span>
            <input
              type="number"
              value={s.seed}
              onChange={(e) => set("seed", Number(e.target.value) || 0)}
            />
            <button type="button" onClick={() => set("seed", Math.floor(Math.random() * 1e6))}>
              🎲
            </button>
          </div>
        </Section>

        <Section title="Animation">
          <Toggle label="Grow" checked={s.grow} onChange={(v) => set("grow", v)} />
          {s.grow && (
            <>
              <Slider
                label="Duration"
                value={s.growDuration}
                min={0.2}
                max={4}
                step={0.1}
                unit="s"
                onChange={(v) => set("growDuration", v)}
              />
              <Slider
                label="Stagger"
                value={s.growStagger}
                min={0}
                max={0.5}
                step={0.01}
                unit="s"
                onChange={(v) => set("growStagger", v)}
              />
              <Segmented
                label="Order"
                value={s.growOrder}
                options={["auto", "start", "end", "center", "random"] as const}
                onChange={(v) => set("growOrder", v)}
              />
            </>
          )}
          <Toggle label="Idle sway" checked={s.sway} onChange={(v) => set("sway", v)} />
          {s.sway && (
            <>
              <Slider
                label="Sway amount"
                value={s.swayAmplitude}
                min={0}
                max={15}
                step={0.5}
                unit="°"
                onChange={(v) => set("swayAmplitude", v)}
              />
              <Slider
                label="Sway period"
                value={s.swayPeriod}
                min={0.5}
                max={10}
                step={0.1}
                unit="s"
                onChange={(v) => set("swayPeriod", v)}
              />
              <Toggle label="Wind gusts" checked={s.wave} onChange={(v) => set("wave", v)} />
              {s.wave && (
                <Slider
                  label="Gust strength"
                  value={s.waveAmplitude}
                  min={0}
                  max={25}
                  step={0.5}
                  unit="°"
                  onChange={(v) => set("waveAmplitude", v)}
                />
              )}
            </>
          )}
        </Section>

        <Section title="Colour & extras">
          <Color label="Glyphs" value={s.glyphColor} onChange={(v) => set("glyphColor", v)} />
          <Select
            label="Palette"
            value={s.palette}
            options={Object.keys(PALETTES)}
            onChange={(v) => set("palette", v)}
          />
          <Color label="Stems" value={s.stemColor} onChange={(v) => set("stemColor", v)} />
          <Toggle label="Show path" checked={s.showPath} onChange={(v) => set("showPath", v)} />
          {s.showPath && (
            <>
              <Color
                label="Path colour"
                value={s.pathColor}
                onChange={(v) => set("pathColor", v)}
              />
              <Slider
                label="Path width"
                value={s.pathWidth}
                min={0.5}
                max={12}
                step={0.5}
                onChange={(v) => set("pathWidth", v)}
              />
            </>
          )}
          <Toggle label="Spores" checked={s.spores} onChange={(v) => set("spores", v)} />
          {s.spores && (
            <>
              <Slider
                label="Spores / char"
                value={s.sporeCount}
                min={0}
                max={10}
                step={0.5}
                onChange={(v) => set("sporeCount", v)}
              />
              <Slider
                label="Spore size"
                value={s.sporeSize}
                min={0.3}
                max={5}
                step={0.1}
                onChange={(v) => set("sporeSize", v)}
              />
            </>
          )}
          <Toggle
            label="Transparent bg"
            checked={s.transparent}
            onChange={(v) => set("transparent", v)}
          />
          {!s.transparent && (
            <Color label="Background" value={s.background} onChange={(v) => set("background", v)} />
          )}
        </Section>
      </aside>

      <main className="stage">
        <div className="toolbar">
          <button type="button" onClick={replay}>
            ↻ Replay
          </button>
          <button type="button" onClick={() => fireBlast(wiltTarget)}>
            💥 Blast
          </button>
          <button type="button" onClick={download} disabled={!result?.svg}>
            ⤓ Download SVG
          </button>
          <button type="button" onClick={() => void copy()} disabled={!result?.svg}>
            Copy SVG
          </button>
          <button type="button" onClick={() => setS(INITIAL)}>
            Reset
          </button>
          {result && !result.error && (
            <span className="meta">
              {result.characters.length} sprouts · {result.fontSize.toFixed(1)}px
              {result.fontSize < s.fontSize - 0.05 ? " (shrunk to fit)" : ""}
            </span>
          )}
          {toast && <span className="toast">{toast}</span>}
        </div>
        <div className="canvas" style={{ aspectRatio: `${s.width} / ${s.height}` }}>
          {!font && <p className="loading">Loading font…</p>}
          {result?.error && <p className="error">{result.error}</p>}
          {result?.svg && (
            <div className="svg-host" dangerouslySetInnerHTML={{ __html: result.svg }} />
          )}
          {drawing && (
            <DrawOverlay
              width={s.width}
              height={s.height}
              onDone={(pts) => {
                setDrawing(false);
                if (pts.length > 2) {
                  set("path", { kind: "custom", d: pathInputToData(pts) });
                  replay();
                }
              }}
            />
          )}
        </div>
        <Snippet settings={s} pathData={pathData} />
      </main>
    </div>
  );
}

function DrawOverlay({
  width,
  height,
  onDone,
}: {
  width: number;
  height: number;
  onDone: (pts: Point[]) => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [pts, setPts] = useState<Point[]>([]);
  const active = useRef(false);

  const toLocal = (e: React.PointerEvent): Point | null => {
    const svg = ref.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
  };

  return (
    <svg
      ref={ref}
      className="draw-overlay"
      viewBox={`0 0 ${width} ${height}`}
      onPointerDown={(e) => {
        const p = toLocal(e);
        if (!p) return;
        active.current = true;
        (e.target as Element).setPointerCapture(e.pointerId);
        setPts([p]);
      }}
      onPointerMove={(e) => {
        if (!active.current) return;
        const p = toLocal(e);
        if (!p) return;
        setPts((prev) => {
          const last = prev[prev.length - 1];
          // Thin the stroke so the spline stays smooth.
          if (last && Math.hypot(p.x - last.x, p.y - last.y) < Math.max(width, height) / 60)
            return prev;
          return [...prev, p];
        });
      }}
      onPointerUp={() => {
        active.current = false;
        onDone(pts);
      }}
    >
      <rect width={width} height={height} fill="rgba(255,255,255,0.35)" />
      {pts.length > 1 && (
        <path
          d={pathInputToData(pts)}
          fill="none"
          stroke="#c0392b"
          strokeWidth={3}
          strokeDasharray="6 6"
        />
      )}
      {pts.length === 0 && (
        <text
          x={width / 2}
          y={height / 2}
          textAnchor="middle"
          fontSize={Math.min(width, height) / 18}
          fill="#555"
        >
          Drag to draw a path (direction matters: letters grow on its left)
        </text>
      )}
    </svg>
  );
}

function Snippet({ settings: s, pathData }: { settings: Settings; pathData: string }) {
  const choice = FONT_CHOICES.find((c) => c.label === s.fontChoice);
  const fontExpr = choice?.css
    ? JSON.stringify(choice.css)
    : `await loadFont(${JSON.stringify(choice?.file ?? "your-font.ttf")})`;
  const opts: Record<string, unknown> = {
    text: s.text,
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
    rhizoids: s.rhizoids,
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
    glyphColor: s.glyphColor,
    palette: PALETTES[s.palette] ?? undefined,
    stemColor: s.stemColor,
    showPath: s.showPath && { color: s.pathColor, width: s.pathWidth },
    spores: s.spores && { count: s.sporeCount, size: s.sporeSize },
    background: s.transparent ? undefined : s.background,
  };
  const body = JSON.stringify(opts, null, 2).replace(/\n}$/, `,\n  "font": ${fontExpr}\n}`);
  const code = `import { renderGrowtype, loadFont } from "@growtype/core";\n\nconst svg = renderGrowtype(${body});`;
  return (
    <details className="snippet">
      <summary>Code</summary>
      <pre className="mono">{code}</pre>
    </details>
  );
}
