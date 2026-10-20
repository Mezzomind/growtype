// Verifies that the publishable packages share one semantic version and, when given a tag
// (vX.Y.Z), that it matches. The release workflow sets the version from the tag first.
import { readFileSync } from "node:fs";
import { parseReleaseTag, parseSemver } from "./semver.mjs";

const packages = ["packages/core", "packages/react"].map((dir) => {
  const pkg = JSON.parse(readFileSync(new URL(`../${dir}/package.json`, import.meta.url), "utf8"));
  try {
    parseSemver(pkg.version);
  } catch (error) {
    console.error(`${pkg.name}: ${error.message}`);
    process.exit(1);
  }
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
// An explicit argument, or the ref GitHub Actions is building – but only when that ref is a tag
// (on PRs and branches GITHUB_REF_NAME is e.g. "1/merge" or "main").
const tag =
  process.argv[2] ??
  (process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : undefined);
if (tag) {
  try {
    parseReleaseTag(tag);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  if (tag !== `v${version}`) {
    console.error(`Tag ${tag} does not match package version ${version} (expected v${version}).`);
    process.exit(1);
  }
}
console.log(
  `OK: ${packages.map((p) => p.name).join(", ")} at ${version}${tag ? ` (tag ${tag})` : ""}`,
);
