import {
  type GrowtypeOptions,
  type GrowtypeResult,
  type WiltTransition,
  growtype,
  wiltIndex,
} from "growtype";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** How wilt changes animate (which stage it starts from, and when, are filled in for you). */
export type WiltTransitionSettings = Omit<WiltTransition, "from" | "at" | "interrupts">;

export interface UseGrowtypeSettings {
  /**
   * Animate each change of `wilt`: sprouts sink (or spring back up) one after another along the
   * path. `false` changes stage instantly. Default true.
   */
  wiltTransition?: boolean | WiltTransitionSettings;
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
  /** A standalone SVG whose animations start from zero (at the current wilt, no transition). */
  toSVG: () => string;
}

/** The core's defaults, so the hook knows when a transition is over. */
const DEFAULT_TRANSITION = { duration: 1.4, stagger: 0.8 };
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** Seconds on the timeline when every sprout has settled after a transition. */
const transitionEnd = (t: WiltTransition): number =>
  (t.at ?? 0) +
  (t.stagger ?? DEFAULT_TRANSITION.stagger) +
  (t.duration ?? DEFAULT_TRANSITION.duration);

/** The part of a transition chain still playing at time `at` (finished ones dropped). */
function stillPlaying(
  t: WiltTransition | null | undefined,
  at: number,
): WiltTransition | undefined {
  if (!t || transitionEnd(t) < at) return undefined;
  return { ...t, interrupts: stillPlaying(t.interrupts, at) };
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
 * and animates changes of the wilt stage.
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
  const transitionCfg =
    settings.wiltTransition === false
      ? null
      : typeof settings.wiltTransition === "object"
        ? settings.wiltTransition
        : {};

  const [replayKey, setReplayKey] = useState(0);
  const [frame, setFrame] = useState(0);
  // The transition playing, if any. Held in a ref so a wilt change can start one in the same
  // render that sees it, rather than in an effect afterwards: otherwise that render would show
  // every sprout already at the new wilt, then snap back to animate there.
  const transitionRef = useRef<WiltTransition | null>(null);

  const wilt = options ? wiltIndex(options.wilt) : 0;
  const prevWilt = useRef(wilt);
  if (prevWilt.current !== wilt) {
    const from = prevWilt.current;
    prevWilt.current = wilt;
    const at = timeline();
    transitionRef.current = transitionCfg && {
      ...DEFAULT_TRANSITION,
      ...transitionCfg,
      from,
      at,
      // A transition still playing carries on until each sprout's turn comes, so nothing jumps
      // back to rest first.
      interrupts: stillPlaying(transitionRef.current, at),
    };
  }
  const transition = transitionRef.current;

  // Re-render every frame while it plays, so each sprout moves on in turn.
  useEffect(() => {
    if (!transition) return;
    let end = 0;
    for (let t: WiltTransition | undefined = transition; t; t = t.interrupts)
      end = Math.max(end, transitionEnd(t));
    let raf = requestAnimationFrame(function tick() {
      if (timeline() > end && transitionRef.current === transition) transitionRef.current = null;
      setFrame((f) => f + 1);
      if (transitionRef.current === transition) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [transition, timeline]);

  const prevKey = useRef(key);
  const rendered = useMemo(() => {
    if (settings.restartOnChange && prevKey.current !== key) epoch.current = now();
    prevKey.current = key;
    const opts = optionsRef.current;
    if (!opts) return { result: null, error: null };
    try {
      return {
        result: growtype({
          ...opts,
          wiltTransition: transition ?? opts.wiltTransition,
          timeOffset: timeline(),
        }),
        error: null,
      };
    } catch (e) {
      return { result: null, error: e instanceof Error ? e : new Error(String(e)) };
    }
  }, [key, replayKey, frame, transition, settings.restartOnChange, timeline]);

  const replay = useCallback(() => {
    epoch.current = now();
    setReplayKey((k) => k + 1);
  }, []);

  const toSVG = useCallback(() => {
    const opts = optionsRef.current;
    return opts ? growtype({ ...opts, wiltTransition: undefined, timeOffset: 0 }).svg : "";
  }, []);

  return { ...rendered, replay, toSVG };
}
