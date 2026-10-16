# growtype-react

React bindings for [`growtype`](../core): text sprouting out of an SVG path.

```sh
pnpm add growtype-react   # re-exports everything from growtype
```

## `<Growtype>`

```tsx
import { Growtype } from "growtype-react";

export function Hero({ stage }: { stage: "full" | "wilted" }) {
  return (
    <Growtype
      text="spores of thought"
      fontUrl="/fonts/FreckleFace-Regular.ttf"
      path="M 54 294 C 270 189, 495 399, 846 260"
      width={900}
      height={420}
      justify="center"
      grow
      sway
      spores
      wilt={stage}
    />
  );
}
```

It takes every [`growtype` option](../core#options) as a prop, plus:

| Prop                 | Default   |                                                                                                                                                                               |
| -------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fontUrl`            | –         | Font file (TTF / OTF / WOFF) to load and embed as glyph outlines. Cached and shared between components.                                                                       |
| `font`               | `"serif"` | Alternatively a loaded font (`await loadFont(url)`), a CSS family, or `{ family, weight, style }`.                                                                            |
| `wiltTransition`     | `true`    | Animate each change of `wilt`: sprouts fall (or spring back up) one after another along the path. `{ duration, stagger, direction }` to tune it, `false` to change instantly. |
| `restartOnChange`    | `false`   | Restart animations when props change. By default they continue where they are, so changing props mid-animation never jumps.                                                   |
| `responsive`         | `true`    | Scale to the container's width, keeping the aspect ratio.                                                                                                                     |
| `fallback`           | `null`    | Rendered while `fontUrl` loads.                                                                                                                                               |
| `className`, `style` | –         | Applied to the wrapping `<div>`.                                                                                                                                              |
| `onRender(result)`   | –         | Layout details after each render (`fontSize`, per-character positions…).                                                                                                      |
| `onError(error)`     | –         | Font loading or rendering failed.                                                                                                                                             |

A `ref` gives you `replay()` and `toSVG()` (a standalone SVG string whose animations start from
zero).

The SVG is only recomputed when props actually change; unrelated parent re-renders leave the DOM
– and the running animations – untouched.

### Pasting a config from the playground

The playground's **Config** panel exports exactly these props as JSON (or a ready-made component):

```tsx
const config = {
  text: "spores of thought",
  fontUrl: "/fonts/FreckleFace-Regular.ttf" /* … */,
} as const;
<Growtype {...config} />;
```

`GrowtypeConfig` is the type of that plain-data object.

## Hooks

- `useGrowtype(options, { wiltTransition, restartOnChange })` – the engine behind `<Growtype>`:
  returns `{ result, error, replay, toSVG }` for rendering the SVG yourself.
- `useFont(url)` – `{ font, error, loading }`; `preloadFont(url)` warms the cache early.

## Server rendering

`<Growtype>` renders on the server when given a CSS `font` (font files load in the browser, so
`fontUrl` renders `fallback` on the server).
