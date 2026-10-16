import {
  CssFontAdapter,
  type FontAdapter,
  type GrowFont,
  type GrowtypeOptions,
  type Point,
  WILT_STAGES,
  loadFont,
  parseFont,
  pathInputToData,
} from "growtype";
import { type GrowtypeConfig, useGrowtype } from "growtype-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fromConfig, toConfig, toReactSnippet } from "./config.ts";
import { Color, Section, Segmented, Select, Slider, Toggle } from "./controls.tsx";
import { FONT_CHOICES, PALETTES, PATH_PRESETS } from "./presets.ts";
import { INITIAL, type Settings, WILT_LABELS } from "./settings.ts";

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

export function App() {
  const [s, setS] = useState<Settings>(INITIAL);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setS((prev) => ({ ...prev, [key]: value }));
  const { files, cssReady, error: fontError, addUpload } = useFonts();
  const [drawing, setDrawing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

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

  // The settings as plain-JSON <Growtype> props: what the Config panel exports.
  const config = useMemo(() => toConfig(s, pathData), [s, pathData]);

  const options: GrowtypeOptions | null = useMemo(() => {
    if (!font) return null;
    const {
      fontUrl: _fontUrl,
      font: _font,
      wiltTransition: _transition,
      restartOnChange: _restart,
      ...rest
    } = config;
    return { ...rest, font };
  }, [config, font]);

  const g = useGrowtype(options, { wiltTransition: config.wiltTransition });
  const result = g.result;
  const replay = g.replay;
  const exportSvg = g.toSVG;

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
            label="Animate changes"
            checked={s.animateWilt}
            onChange={(v) => set("animateWilt", v)}
          />
          {s.animateWilt && (
            <>
              <Slider
                label="Duration"
                value={s.wiltDuration}
                min={0.2}
                max={4}
                step={0.1}
                unit="s"
                onChange={(v) => set("wiltDuration", v)}
              />
              <Slider
                label="Stagger"
                value={s.wiltStagger}
                min={0}
                max={3}
                step={0.1}
                unit="s"
                onChange={(v) => set("wiltStagger", v)}
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
          <button type="button" onClick={download} disabled={!result?.svg}>
            ⤓ Download SVG
          </button>
          <button type="button" onClick={() => void copy()} disabled={!result?.svg}>
            Copy SVG
          </button>
          <button type="button" onClick={() => setS(INITIAL)}>
            Reset
          </button>
          {result && (
            <span className="meta">
              {result.characters.length} sprouts · {result.fontSize.toFixed(1)}px
              {result.fontSize < s.fontSize - 0.05 ? " (shrunk to fit)" : ""}
            </span>
          )}
          {toast && <span className="toast">{toast}</span>}
        </div>
        <div className="canvas" style={{ aspectRatio: `${s.width} / ${s.height}` }}>
          {!font && <p className="loading">Loading font…</p>}
          {g.error && <p className="error">{g.error.message}</p>}
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
        <ConfigPanel
          config={config}
          onImport={(json) => {
            const r = fromConfig(json, s);
            if ("error" in r) return { ok: false, message: r.error };
            setS(r.settings);
            replay();
            return { ok: true, message: ["Applied.", ...r.notes].join(" ") };
          }}
          onCopied={flash}
        />
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

function ConfigPanel({
  config,
  onImport,
  onCopied,
}: {
  config: GrowtypeConfig;
  onImport: (json: string) => { ok: boolean; message: string };
  onCopied: (msg: string) => void;
}) {
  const [tab, setTab] = useState<"json" | "react" | "import">("json");
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const json = JSON.stringify(config, null, 2);
  const shown = tab === "react" ? toReactSnippet(config) : json;

  const copy = async () => {
    await navigator.clipboard.writeText(shown);
    onCopied(tab === "react" ? "React snippet copied" : "Config copied");
  };
  const apply = () => {
    const { ok, message: text } = onImport(draft);
    setMessage({ ok, text });
  };

  return (
    <section className="config">
      <div className="config-head">
        <h2>Config</h2>
        <div className="segmented" role="tablist">
          {(
            [
              ["json", "JSON"],
              ["react", "React"],
              ["import", "Import"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={tab === key ? "active" : ""}
              onClick={() => {
                setTab(key);
                setMessage(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "import" ? (
          <button type="button" onClick={apply} disabled={!draft.trim()}>
            Apply
          </button>
        ) : (
          <button type="button" onClick={() => void copy()}>
            Copy
          </button>
        )}
      </div>
      {tab === "import" ? (
        <>
          <textarea
            className="mono config-body"
            rows={12}
            placeholder="Paste a growtype config (JSON) here…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          {message && <p className={message.ok ? "note" : "error"}>{message.text}</p>}
        </>
      ) : (
        <pre className="mono config-body">{shown}</pre>
      )}
    </section>
  );
}
