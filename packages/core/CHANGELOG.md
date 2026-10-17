# Changelog

## 0.2.0

- **Breaking:** the `blast` option is gone. Animate wilt changes with `wiltTransition` instead:
  sprouts sink (or spring back up) one after another along the path, and a change made
  mid-transition picks each sprout up from where it is.
- Wilt stages are far more pronounced: glyphs sink lower on buckling stalks at each stage,
  slumping a little to either side while staying readable, and wilted sprouts stop swaying.
- `exit` animates the sprouts away: in turn along the path, each glyph falls off its stalk and
  drops out of view while the stalk wilts and shrinks back into the path; `direction: "random"`
  sends them in no particular order.
- `textTransition: { from, at }` animates a change of text: the old text leaves, then the new
  text grows in under the path that's already drawn.
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
