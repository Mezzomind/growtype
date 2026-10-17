import type { FontInput, GrowtypeOptions, GrowtypeResult } from "growtype";
import {
  type CSSProperties,
  type ReactNode,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { useFont } from "./font.ts";
import { type UseGrowtypeSettings, useGrowtype } from "./useGrowtype.ts";

/** Everything you can configure as plain data (what the playground's config export produces). */
export interface GrowtypeConfig
  extends
    Omit<GrowtypeOptions, "font" | "timeOffset" | "wiltTransition" | "textTransition" | "exit">,
    UseGrowtypeSettings {
  /** URL of a font file (TTF / OTF / WOFF) to embed as glyph outlines. */
  fontUrl?: string;
  /** A CSS font family (or `{ family, weight, style }`) to use instead of a font file. */
  font?: Exclude<FontInput, object> | { family: string; weight?: string | number; style?: string };
}

export interface GrowtypeProps extends Omit<GrowtypeConfig, "font"> {
  /** A loaded font (`await loadFont(url)`), a CSS family, or `{ family, weight, style }`. Default `serif`. */
  font?: FontInput;
  /** Scale the SVG to the container's width, keeping its aspect ratio. Default true. */
  responsive?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Shown while `fontUrl` is loading. */
  fallback?: ReactNode;
  /** Called after each render with the layout details. */
  onRender?: (result: GrowtypeResult) => void;
  /** Called if the font fails to load or rendering throws. */
  onError?: (error: Error) => void;
}

export interface GrowtypeHandle {
  /** Restart all animations from the beginning. */
  replay: () => void;
  /** A standalone SVG string whose animations start from zero. */
  toSVG: () => string;
}

const RESPONSIVE_STYLE = 'style="display:block;width:100%;height:auto"';

/**
 * Text sprouting out of an SVG path.
 *
 * ```tsx
 * <Growtype text="spores of thought" fontUrl="/fonts/FreckleFace-Regular.ttf"
 *   path="M 54 294 C 270 189, 495 399, 846 260" width={900} height={420}
 *   grow sway wilt={stage} />
 * ```
 */
export const Growtype = forwardRef<GrowtypeHandle, GrowtypeProps>(function Growtype(props, ref) {
  const {
    font,
    fontUrl,
    wiltTransition,
    textTransition,
    restartOnChange,
    responsive = true,
    className,
    style,
    fallback = null,
    onRender,
    onError,
    ...options
  } = props;

  const loaded = useFont(fontUrl);
  const resolved = fontUrl ? loaded.font : (font ?? "serif");
  const growOptions: GrowtypeOptions | null = resolved ? { ...options, font: resolved } : null;
  const g = useGrowtype(growOptions, { wiltTransition, textTransition, restartOnChange });

  // Replay remounts the SVG: its markup can be identical to what's shown (both start at time 0),
  // and the browser only restarts CSS animations for new elements.
  const [replays, setReplays] = useState(0);
  useImperativeHandle(
    ref,
    () => ({
      replay: () => {
        g.replay();
        setReplays((n) => n + 1);
      },
      toSVG: g.toSVG,
    }),
    [g.replay, g.toSVG],
  );

  const error = loaded.error ?? g.error;
  useEffect(() => {
    if (error) onError?.(error);
  }, [error]);
  useEffect(() => {
    if (g.result) onRender?.(g.result);
  }, [g.result]);

  const svg = g.result?.svg;
  const html = useMemo(
    () => (svg && responsive ? svg.replace("<svg ", `<svg ${RESPONSIVE_STYLE} `) : svg),
    [svg, responsive],
  );

  if (!html) return <>{fallback}</>;
  return (
    <div
      key={replays}
      className={className}
      style={style}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});
