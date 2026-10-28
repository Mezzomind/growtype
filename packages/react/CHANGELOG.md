# Changelog

## [0.2.3](https://github.com/Mezzomind/growtype/compare/v0.2.2...v0.2.3) (2026-10-28)

### Bug Fixes

* reject an idPrefix that is not a CSS identifier ([fa229c1](https://github.com/Mezzomind/growtype/commit/fa229c1bdc07ab5ced5dc1876f699794ca1827eb))

### Performance Improvements

* reuse font adapters and path objects, bound the hot loops ([874dbed](https://github.com/Mezzomind/growtype/commit/874dbedc4a6786ba880b952d8e9ca9fb82d560df))

## [0.2.2](https://github.com/Mezzomind/growtype/compare/v0.2.1...v0.2.2) (2026-10-21)

### Bug Fixes

- attempt at publishing directly to validate publisher ([fe8aa2a](https://github.com/Mezzomind/growtype/commit/fe8aa2a5781d76acfcf9c1471b120e999d880ec3))
- attempt at publishing directly to validate publisher ([1807040](https://github.com/Mezzomind/growtype/commit/1807040a6375e067d442774b0e24ef387d719243))
- drop npm stage list from the release script ([d75ff67](https://github.com/Mezzomind/growtype/commit/d75ff675883a7435c0c268a0e71ea027d1026ffd))
- force commit writer version 9 ([d03bd6b](https://github.com/Mezzomind/growtype/commit/d03bd6b54f76c01d1a2a8fd8d6ea0b2ed7eaca8e))
- formatting ([1b60048](https://github.com/Mezzomind/growtype/commit/1b60048072cdee70f94e449579c71966d3d12414))
- rework release flow with semantic-release ([3185ca8](https://github.com/Mezzomind/growtype/commit/3185ca85208bb2ea5352af432db80dbfe2b8ac03))

## 0.2.0

- **Breaking:** `blastOnWiltChange` and the ref's `blast()` are gone. Wilt changes now animate by
  default (`wiltTransition`, `false` to switch off), starting in the same render as the change
  and carrying on from where sprouts are if it changes again mid-transition.
- Text changes animate by default (`textTransition`, `false` to switch off): the old glyphs fall
  off their stalks while the stalks wilt away, then the new text grows in.
- `replay()` restarts the animations even when nothing has re-rendered since mounting.

## 0.1.0

First release.

- `<Growtype>` component: every `growtype` option as a prop, `fontUrl` loading with a
  shared cache, responsive sizing, `blastOnWiltChange`, and a ref with `replay`, `blast` and
  `toSVG`. Animations keep running across re-renders.
- `useGrowtype`, `useFont` and `preloadFont` hooks.
- `GrowtypeConfig`: the plain-data props the playground exports.
- Re-exports `growtype`.
