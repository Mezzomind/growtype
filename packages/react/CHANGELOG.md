# Changelog

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
