# Changelog

## [0.2.2](https://github.com/Mezzomind/growtype/compare/v0.2.1...v0.2.2) (2026-10-21)

### Bug Fixes

- attempt at publishing directly to validate publisher ([fe8aa2a](https://github.com/Mezzomind/growtype/commit/fe8aa2a5781d76acfcf9c1471b120e999d880ec3))
- attempt at publishing directly to validate publisher ([1807040](https://github.com/Mezzomind/growtype/commit/1807040a6375e067d442774b0e24ef387d719243))
- drop npm stage list from the release script ([d75ff67](https://github.com/Mezzomind/growtype/commit/d75ff675883a7435c0c268a0e71ea027d1026ffd))
- force commit writer version 9 ([d03bd6b](https://github.com/Mezzomind/growtype/commit/d03bd6b54f76c01d1a2a8fd8d6ea0b2ed7eaca8e))
- formatting ([1b60048](https://github.com/Mezzomind/growtype/commit/1b60048072cdee70f94e449579c71966d3d12414))
- rework release flow with semantic-release ([3185ca8](https://github.com/Mezzomind/growtype/commit/3185ca85208bb2ea5352af432db80dbfe2b8ac03))

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
