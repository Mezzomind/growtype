import {
  type BlastOptions,
  type GrowtypeOptions,
  type GrowtypeResult,
  growtype,
  wiltIndex,
} from "growtype";
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

/** Seconds on the timeline when a blast and its recoil are over. */
const blastEnd = (b: BlastOptions): number =>
  (b.at ?? 0) + (b.duration ?? DEFAULT_BLAST.duration) + (b.recoil ?? DEFAULT_BLAST.recoil) + 0.3;

/** The part of a blast chain still playing at time `t` (finished blasts dropped). */
function stillPlaying(b: BlastOptions | null | undefined, t: number): BlastOptions | undefined {
  if (!b || blastEnd(b) < t) return undefined;
  return { ...b, interrupts: stillPlaying(b.interrupts, t) };
}

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
  // The blast playing, if any. Held in a ref so a wilt change can start one in the same render
  // that sees it (see below); `frame` re-renders whenever it changes.
  const blastRef = useRef<BlastOptions | null>(null);

  const makeBlast = useCallback(
    (overrides: Parameters<UseGrowtypeResult["blast"]>[0] = {}): BlastOptions => {
      const at = timeline() + 0.05;
      return {
        ...DEFAULT_BLAST,
        ...blastCfgRef.current,
        ...overrides,
        at,
        fromWilt: overrides.fromWilt ?? optionsRef.current?.wilt,
        // A blast still playing carries on until this front reaches each sprout, so nothing
        // jumps back to rest first.
        interrupts: stillPlaying(blastRef.current, at),
      };
    },
    [timeline],
  );

  const fireBlast = useCallback<UseGrowtypeResult["blast"]>(
    (overrides) => {
      blastRef.current = makeBlast(overrides);
      setFrame((f) => f + 1);
    },
    [makeBlast],
  );

  // Start the blast while rendering the wilt change, not in an effect afterwards: otherwise that
  // render shows every sprout already at the new wilt, before the wave has reached it.
  const wilt = options ? wiltIndex(options.wilt) : 0;
  const prevWilt = useRef(wilt);
  if (prevWilt.current !== wilt) {
    const from = prevWilt.current;
    prevWilt.current = wilt;
    if (blastCfg) blastRef.current = makeBlast({ fromWilt: from });
  }
  const blast = blastRef.current;

  // Re-render every frame while it plays, so each sprout's wilt changes as the front passes.
  useEffect(() => {
    if (!blast) return;
    let end = 0;
    for (let b: BlastOptions | undefined = blast; b; b = b.interrupts)
      end = Math.max(end, blastEnd(b));
    let raf = requestAnimationFrame(function tick() {
      if (timeline() > end && blastRef.current === blast) blastRef.current = null;
      setFrame((f) => f + 1);
      if (blastRef.current === blast) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [blast, timeline]);

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
