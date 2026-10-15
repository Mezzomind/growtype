// Verifies that the publishable packages share one version and, when given a tag (vX.Y.Z),
// that it matches. Used by the release workflow before anything is published.
import { readFileSync } from "node:fs";

const packages = ["packages/core", "packages/react"].map((dir) => {
  const pkg = JSON.parse(readFileSync(new URL(`../${dir}/package.json`, import.meta.url), "utf8"));
  return { dir, name: pkg.name, version: pkg.version };
});

const versions = new Set(packages.map((p) => p.version));
if (versions.size !== 1) {
  console.error(
    "Package versions differ:",
    packages.map((p) => `${p.name}@${p.version}`).join(", "),
  );
  process.exit(1);
}
const [version] = versions;
const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;
if (tag && tag !== `v${version}`) {
  console.error(`Tag ${tag} does not match package version ${version} (expected v${version}).`);
  process.exit(1);
}
console.log(
  `OK: ${packages.map((p) => p.name).join(", ")} at ${version}${tag ? ` (tag ${tag})` : ""}`,
);
