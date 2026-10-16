# Changelog

## Unreleased

- **Breaking:** the `blast` option is gone. Animate wilt changes with `wiltTransition` instead:
  sprouts fall (or spring back up) one after another along the path, and a change made
  mid-transition picks each sprout up from where it is.
- Wilt stages are far more pronounced: wilted stalks collapse and their glyphs lie on the path,
  all fallen the same way.
- Faster rendering (overlap resolution and SVG output), and glyph caches are bounded.

## 0.1.0

First release.

- Render text along an SVG path (or a list of points) with each character sprouting on an
  organic, mould-spore-like stalk with a flared foot.
- Fonts: font files (TTF / OTF / WOFF, embedded as glyph outlines) or CSS fonts (`<text>`).
- Emoji anywhere in the text: grapheme-aware splitting and a colour emoji fallback font.
- Layout: natural or fill-the-path, aligned to the path's start, centre or end; auto-shrink;
  curvature-compensated spacing; `baseSpacing` to huddle stem bases within words.
- Stalks: length, thickness, flare, wobble and per-stalk variation (bows, nodes, side branches).
- Tilt range with neighbour coherence, glyph twist, baseline or ink anchors.
- Overlap avoidance between neighbouring glyphs and stalks.
- Four wilt stages, and a blast wave that sweeps in from the left or right.
- Self-contained CSS animations: grow, idle sway, wind gusts; respects `prefers-reduced-motion`.
- Seeded, deterministic output.
