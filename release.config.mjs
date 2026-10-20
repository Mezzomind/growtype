// Both packages share one version. Conventional commits on main choose it; the plugins
// write it into the manifests and changelogs, tag it, and stage the tarballs.
// npm publishing stays staged (trusted publishing, then a maintainer's 2FA approval),
// so @semantic-release/npm only updates package.json.
const preset = "conventionalcommits";

export default {
  branches: ["main"],
  tagFormat: "v${version}",
  plugins: [
    ["@semantic-release/commit-analyzer", { preset }],
    ["@semantic-release/release-notes-generator", { preset }],
    [
      "@semantic-release/changelog",
      { changelogFile: "packages/core/CHANGELOG.md", changelogTitle: "# Changelog" },
    ],
    [
      "@semantic-release/changelog",
      { changelogFile: "packages/react/CHANGELOG.md", changelogTitle: "# Changelog" },
    ],
    ["@semantic-release/npm", { npmPublish: false, pkgRoot: "packages/core" }],
    ["@semantic-release/npm", { npmPublish: false, pkgRoot: "packages/react" }],
    [
      "@semantic-release/exec",
      { prepareCmd: "pnpm run release:pack && node scripts/stage-release.mjs" },
    ],
    [
      "@semantic-release/git",
      {
        assets: [
          "packages/core/CHANGELOG.md",
          "packages/core/package.json",
          "packages/react/CHANGELOG.md",
          "packages/react/package.json",
        ],
        message: "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
      },
    ],
    "@semantic-release/github",
  ],
};
