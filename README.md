# growtype

Letters that grow out of a path like little mould spores.

A [Vite+](https://viteplus.dev) monorepo:

- [`packages/core`](packages/core) – `@growtype/core`, the TypeScript library that produces the SVG.
- [`packages/react`](packages/react) – `@growtype/react`, a `<Growtype>` component and hooks.
- [`apps/playground`](apps/playground) – a React playground with controls for every option, path
  presets, freehand path drawing, font upload, SVG export, and a Config panel that copies your
  settings as JSON or a ready-made React component (and imports them back).

## Develop

```sh
pnpm install
pnpm dev          # playground
vp test           # unit tests
vp check          # format, lint, type-check
pnpm ready        # check + test + build everything
```

The playground imports the library source directly, so edits to `packages/core/src` hot-reload.

Bundled fonts (Young Serif, Gloock, Sniglet) are from Google Fonts under the SIL Open Font
License; see the `OFL-*.txt` files next to them.
