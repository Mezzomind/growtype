import { type GrowFont, loadFont } from "@growtype/core";
import { useEffect, useState } from "react";

const pending = new Map<string, Promise<GrowFont>>();
const loaded = new Map<string, GrowFont>();

/** Start loading a font file (cached by URL). Call early to avoid a blank first render. */
export function preloadFont(url: string): Promise<GrowFont> {
  let p = pending.get(url);
  if (!p) {
    p = loadFont(url).then((font) => {
      loaded.set(url, font);
      return font;
    });
    p.catch(() => pending.delete(url));
    pending.set(url, p);
  }
  return p;
}

export interface FontState {
  font: GrowFont | null;
  error: Error | null;
  loading: boolean;
}

/** Load a font file (TTF / OTF / WOFF) by URL. Results are cached and shared between components. */
export function useFont(url: string | undefined): FontState {
  const [state, setState] = useState<{ url?: string; font?: GrowFont; error?: Error }>(() =>
    url && loaded.has(url) ? { url, font: loaded.get(url) } : {},
  );
  useEffect(() => {
    if (!url) return;
    if (loaded.has(url)) {
      setState({ url, font: loaded.get(url) });
      return;
    }
    let alive = true;
    preloadFont(url).then(
      (font) => alive && setState({ url, font }),
      (error: unknown) =>
        alive &&
        setState({ url, error: error instanceof Error ? error : new Error(String(error)) }),
    );
    return () => {
      alive = false;
    };
  }, [url]);
  if (!url) return { font: null, error: null, loading: false };
  const current = state.url === url ? state : {};
  const font = current.font ?? loaded.get(url) ?? null;
  return { font, error: current.error ?? null, loading: !font && !current.error };
}
