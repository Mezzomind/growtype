# growtype

Letters that grow out of a path like little mould spores.

**[Playground](https://courdek.github.io/growtype/)** · [`@growtype/core`](packages/core) ·
[`@growtype/react`](packages/react)

```sh
npm install @growtype/react   # React component + hooks (includes the core)
npm install @growtype/core    # framework-free: returns an SVG string
```

Both packages are ESM-only and run in the browser; the core also renders in Node / on the server
with CSS fonts.

## Repository

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
pnpm ready        # check + test + build everything (what CI runs)
```

The playground imports the library source directly, so edits to `packages/*/src` hot-reload.

## Release

Both packages share one version.

1. Bump `version` in `packages/core/package.json` and `packages/react/package.json`, and add the
   changes to each `CHANGELOG.md`.
2. Merge to `main`, then tag and push: `git tag v0.1.1 && git push origin v0.1.1`.
3. The **Release** workflow checks the tag matches the versions, runs the full pipeline, publishes
   both packages to npm with provenance and creates a GitHub release.

One-time setup: add an npm automation token as the `NPM_TOKEN` repository secret, and set
**Settings → Pages → Source** to “GitHub Actions” so the **Playground** workflow can deploy.

## License

[MIT](LICENSE). Bundled fonts (Freckle Face, Young Serif, Gloock, Sniglet) are from Google Fonts
under the SIL Open Font License; see the `OFL-*.txt` files next to them.
