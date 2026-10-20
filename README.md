# growtype

Letters that grow out of a path like little mould spores.

**[Playground](https://mezzomind.github.io/growtype/)** · [`growtype`](packages/core) ·
[`growtype-react`](packages/react)

```sh
npm install growtype-react   # React component + hooks (includes the core)
npm install growtype         # framework-free: returns an SVG string
```

Both packages are ESM-only and run in the browser; the core also renders in Node / on the server
with CSS fonts.

## Repository

A [Vite+](https://viteplus.dev) monorepo:

- [`packages/core`](packages/core) – `growtype`, the TypeScript library that produces the SVG.
- [`packages/react`](packages/react) – `growtype-react`, a `<Growtype>` component and hooks.
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

Both packages share one version. [semantic-release](https://semantic-release.gitbook.io/)
chooses the next one from [conventional commits](https://www.conventionalcommits.org/) on `main`,
writes it into both packages, and tags it. GitHub Actions then
[stages](https://docs.npmjs.com/staged-publishing/) them on npm with
[trusted publishing](https://docs.npmjs.com/trusted-publishers/) (OIDC — no npm token). A
maintainer then approves each staged version with 2FA so it goes live.

### First release (once, by hand)

Trusted publishing can only be configured on packages that already exist, so publish the first
version from your machine (npm asks for your one-time password):

```sh
pnpm install && pnpm ready && pnpm release:pack
npm publish .release/growtype-0.2.0.tgz --access public
npm publish .release/growtype-react-0.2.0.tgz --access public
```

Then, for **each** package on npmjs.com → the package → **Settings → Trusted publishing**, add
GitHub Actions with organization `Mezzomind`, repository `growtype`, workflow `release.yml`, and
allow **npm stage publish**. A new configuration must be used for a successful stage within 2 days
or it expires, so set it up when you're about to release.

### Every release after that

Commit messages on `main` decide the bump:

| Commit | Version |
| --- | --- |
| `fix:` or `perf:` | patch, `0.2.1` |
| `feat:` | minor, `0.3.0` |
| `feat!:` or a `BREAKING CHANGE:` footer | major, `1.0.0` |

Other commits (`chore:`, `docs:`, `refactor:`, …) do not release.

1. Merge to `main`.
2. The **Release** workflow runs semantic-release. When the commits call for a release, it sets
   `version` in both `package.json` files, prepends the notes to each `CHANGELOG.md`, stages
   whichever packages aren't on npm yet, then commits the bump to `main`, tags `vX.Y.Z`, and
   creates the GitHub release. Run the workflow again from the Actions tab to retry.
3. Approve each staged package (2FA): `npm stage approve growtype@x.y.z` and
   `npm stage approve growtype-react@x.y.z` (or approve on npmjs.com).

The playground deploys to GitHub Pages from `main` once **Settings → Pages → Source** is set to
“GitHub Actions”.

## License

[MIT](LICENSE). Bundled fonts (Freckle Face, Young Serif, Gloock, Sniglet) are from Google Fonts
under the SIL Open Font License; see the `OFL-*.txt` files next to them.
