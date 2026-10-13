# @growtype/core

Grow text out of an SVG path. Each character sprouts on a wobbly, mould-spore-like stalk with a
flared, root-splayed foot, randomly askew, optionally animated (sprouting and idle sway) and
optionally wilting.

```ts
import { loadFont, renderGrowtype } from "@growtype/core";

const font = await loadFont("/fonts/YoungSerif-Regular.ttf"); // or a CSS family: "Georgia"

const svg = renderGrowtype({
  text: "spores of thought",
  font,
  path: "M 54 294 C 270 189, 495 399, 846 260", // or [[x, y], ...] points
  width: 900,
  height: 420,
  stemLength: 44,
  stemThickness: 2.4,
  tilt: [-12, 12],
  layout: "natural", // or "fill" to spread across the whole path
  justify: "center",
  grow: true,
  sway: { wave: true },
  wilt: "slightly-damaged",
  spores: true,
  showPath: true,
  seed: 1,
});
```

The result is a single self-contained SVG string: animations are embedded CSS keyframes (they
respect `prefers-reduced-motion`), so it animates inline, in an `<img>`, or as a standalone file.

## API

- `renderGrowtype(options): string` – the SVG markup.
- `growtype(options): GrowtypeResult` – the SVG plus layout details (`fontSize` actually used,
  per-character `base` / `tip` / `rotation` / `growDelay`, `growDuration`).
- `createGrowtypeElement(options): SVGSVGElement` – a live element (browser only).
- `loadFont(url | ArrayBuffer)` / `parseFont(bytes)` – parse a TTF / OTF / WOFF with opentype.js.
- `PathSampler`, `pathInputToData` – path utilities (arc-length sampling, points → smooth path).

## Fonts

- **Font file** (`GrowFont` from `loadFont`) – glyphs are embedded as `<path>` outlines with exact
  bounds and kerning. The SVG looks identical everywhere.
- **CSS font** (`"Georgia"` or `{ family, weight, style }`) – glyphs are `<text>` elements measured
  with a canvas. Lighter output, but the font must be available wherever the SVG is shown, and
  `anchor: "ink"` is approximate.

## Options

| Option                                    | Default      |                                                                                                                                                                                  |
| ----------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text`, `font`, `path`, `width`, `height` | –            | Required. `width`/`height` set the viewBox; path coordinates are in that space.                                                                                                  |
| `fontSize`                                | `48`         | Shrinks automatically if the text doesn't fit.                                                                                                                                   |
| `letterSpacing`                           | `0`          | Natural layout only.                                                                                                                                                             |
| `layout`                                  | `"natural"`  | `"natural"` packs characters; `"fill"` spaces them evenly over the whole path.                                                                                                   |
| `justify`                                 | `"left"`     | `left` / `center` / `right` along the path (natural layout).                                                                                                                     |
| `inset`                                   | `0`          | Clear space at both ends of the path.                                                                                                                                            |
| `side`                                    | `"left"`     | Grow on the left of the path's direction (up, for a left→right path) or the right.                                                                                               |
| `anchor`                                  | `"baseline"` | Stem meets the glyph at its baseline centre, or at its lowest ink (`"ink"`; descenders hang from their tails).                                                                   |
| `compensateCurvature`                     | `true`       | Space letters along the curve they sit on, so they don't bunch in hollows.                                                                                                       |
| `stemLength`                              | `36`         | Distance from path to glyph.                                                                                                                                                     |
| `stemLengthVariance`                      | `0.35`       | ± fraction, per character.                                                                                                                                                       |
| `stemThickness`                           | `2.2`        | Narrowest stalk width.                                                                                                                                                           |
| `flare`                                   | `3`          | Foot width relative to the stalk.                                                                                                                                                |
| `wobble`                                  | `0.6`        | Organic bends and width irregularity.                                                                                                                                            |
| `rhizoids`                                | `3`          | Root hairs per foot.                                                                                                                                                             |
| `tilt`                                    | `18`         | Lean range in degrees: `±n` or `[min, max]`.                                                                                                                                     |
| `tiltCoherence`                           | `0.6`        | 0–1, how much neighbours lean together (reduces collisions).                                                                                                                     |
| `twist`                                   | `6`          | Extra ± glyph rotation relative to its stalk.                                                                                                                                    |
| `wilt`                                    | `"full"`     | `full` → `slightly-damaged` → `damaged` → `wilted` (or 0–3, fractions allowed). Stalks droop, thin and kink; glyphs sag and shrink slightly. Kept subtle so text stays readable. |
| `seed`                                    | `1`          | Same seed + options ⇒ identical SVG. Randomness is keyed per character, so tweaking one option doesn't reshuffle everything.                                                     |
| `grow`                                    | `false`      | `true` or `{ duration, stagger, delay, order, pathDuration }`. Foot blooms, stalk extends, glyph pops. `order: "auto"` follows the justification.                                |
| `sway`                                    | `false`      | `true` or `{ amplitude, period, wave }`. Each sprout sways about its foot with its own phase; `wave` adds gusts of wind travelling along the path.                               |
| `glyphColor` / `palette`                  | `#24301a`    | `palette` picks a seeded colour per glyph.                                                                                                                                       |
| `stemColor`                               | `#7c8f55`    |                                                                                                                                                                                  |
| `showPath`                                | `false`      | `true` or `{ color, width, opacity }`; draws itself first when growing.                                                                                                          |
| `spores`                                  | `false`      | `true` or `{ count, size, color, spread }`. Drift when swaying.                                                                                                                  |
| `background`                              | –            | Fill colour for the whole SVG.                                                                                                                                                   |
| `timeOffset`                              | `0`          | Start the animation timeline N seconds in (to re-render live without restarting).                                                                                                |
| `idPrefix`                                | derived      | Prefix for ids/classes; set it when inlining several different SVGs on one page.                                                                                                 |
| `title`                                   | the text     | Accessible `<title>`; `false` to omit.                                                                                                                                           |
