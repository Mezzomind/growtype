import {
  type BlastOptions,
  type GrowtypeOptions,
  type GrowtypeResult,
  growtype,
  wiltIndex,
} from "@growtype/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** Blast settings used when the wilt stage changes (timing and `fromWilt` are filled in for you). */
export type BlastOnWiltChange = Omit<BlastOptions, "at" | "fromWilt">;

export interface UseGrowtypeSettings {
  /** Sweep a blast wave across the text whenever `wilt` changes. Default false. */
  blastOnWiltChange?: boolean | BlastOnWiltChange;
  /**
   * Restart the animation timeline whenever the options change. By default animations continue
   * where they are, so tweaking props mid-animation doesn't make anything jump.
   */
  restartOnChange?: boolean;
}

export interface UseGrowtypeResult {
  /** The latest render, or null while there are no options (e.g. the font is still loading). */
  result: GrowtypeResult | null;
  error: Error | null;
  /** Restart all animations from the beginning. */
  replay: () => void;
  /** Fire a blast wave now (optionally overriding its settings). */
  blast: (overrides?: BlastOnWiltChange & { fromWilt?: GrowtypeOptions["wilt"] }) => void;
  /** A standalone SVG whose animations start from zero (no transient blast). */
  toSVG: () => string;
}

const DEFAULT_BLAST = { duration: 1.1, recoil: 1.6 };
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

const fontIds = new WeakMap<object, number>();
let nextFontId = 1;

/** A string that changes exactly when the options do (font objects compared by identity). */
export function optionsKey(options: GrowtypeOptions | null): string {
  if (!options) return "";
  return JSON.stringify(options, (_key, value: unknown) => {
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

/**
 * Render growtype for React. Keeps the animation timeline running across re-renders (so prop
 * changes never restart or jump the animation), only recomputes when the options actually change,
 * and can fire a blast wave whenever the wilt stage changes.
 */
export function useGrowtype(
  options: GrowtypeOptions | null,
  settings: UseGrowtypeSettings = {},
): UseGrowtypeResult {
  const epoch = useRef<number | null>(null);
  if (epoch.current === null) epoch.current = now();
  const timeline = useCallback(() => (now() - epoch.current!) / 1000, []);

  const key = optionsKey(options);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const blastCfg =
    settings.blastOnWiltChange === true
      ? {}
      : settings.blastOnWiltChange
        ? settings.blastOnWiltChange
        : null;
  const blastCfgRef = useRef(blastCfg);
  blastCfgRef.current = blastCfg;

  const [replayKey, setReplayKey] = useState(0);
  const [frame, setFrame] = useState(0);
  const [blast, setBlast] = useState<BlastOptions | null>(null);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const fireBlast = useCallback<UseGrowtypeResult["blast"]>(
    (overrides = {}) => {
      const cfg = { ...DEFAULT_BLAST, ...blastCfgRef.current, ...overrides };
      const at = timeline() + 0.05;
      setBlast({ ...cfg, at, fromWilt: overrides.fromWilt ?? optionsRef.current?.wilt });
      // Re-render every frame while it plays, so each sprout's wilt changes as the front passes.
      cancelAnimationFrame(raf.current);
      const end = at + cfg.duration + cfg.recoil + 0.3;
      const tick = () => {
        if (timeline() > end) {
          setBlast(null);
          return;
        }
        setFrame((f) => f + 1);
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    },
    [timeline],
  );

  const wilt = options ? wiltIndex(options.wilt) : 0;
  const prevWilt = useRef(wilt);
  useEffect(() => {
    if (prevWilt.current === wilt) return;
    const from = prevWilt.current;
    prevWilt.current = wilt;
    if (blastCfgRef.current) fireBlast({ fromWilt: from });
  }, [wilt, fireBlast]);

  const prevKey = useRef(key);
  const rendered = useMemo(() => {
    if (settings.restartOnChange && prevKey.current !== key) epoch.current = now();
    prevKey.current = key;
    const opts = optionsRef.current;
    if (!opts) return { result: null, error: null };
    try {
      return {
        result: growtype({ ...opts, blast: blast ?? opts.blast, timeOffset: timeline() }),
        error: null,
      };
    } catch (e) {
      return { result: null, error: e instanceof Error ? e : new Error(String(e)) };
    }
  }, [key, replayKey, frame, blast, settings.restartOnChange, timeline]);

  const replay = useCallback(() => {
    epoch.current = now();
    setReplayKey((k) => k + 1);
  }, []);

  const toSVG = useCallback(() => {
    const opts = optionsRef.current;
    return opts ? growtype({ ...opts, blast: undefined, timeOffset: 0 }).svg : "";
  }, []);

  return { ...rendered, replay, blast: fireBlast, toSVG };
}
