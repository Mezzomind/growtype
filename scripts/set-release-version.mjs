// Writes the release tag (vX.Y.Z) into every publishable package.json.
// The tag is the source of truth: it must be semantic versioning and newer than the
// version already committed. Used by the release workflow before anything is published.
import { readFileSync, writeFileSync } from "node:fs";
import { compareSemver, parseReleaseTag, parseSemver } from "./semver.mjs";

const tag = process.argv[2];
if (!tag) {
  console.error("Usage: node scripts/set-release-version.mjs vX.Y.Z");
  process.exit(1);
}

let parsed;
try {
  parsed = parseReleaseTag(tag);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const packages = ["packages/core", "packages/react"].map((dir) => {
  const path = new URL(`../${dir}/package.json`, import.meta.url);
  const raw = readFileSync(path, "utf8");
  const pkg = JSON.parse(raw);
  return { dir, path, raw, name: pkg.name, version: pkg.version };
});

for (const pkg of packages) {
  try {
    parseSemver(pkg.version);
  } catch (error) {
    console.error(`${pkg.name}: ${error.message}`);
    process.exit(1);
  }
}

const versions = new Set(packages.map((pkg) => pkg.version));
if (versions.size !== 1) {
  console.error(
    "Package versions differ:",
    packages.map((pkg) => `${pkg.name}@${pkg.version}`).join(", "),
  );
  process.exit(1);
}

const [current] = versions;
if (current === parsed.raw) {
  console.log(`OK: ${packages.map((pkg) => pkg.name).join(", ")} already at ${current}`);
  process.exit(0);
}

if (compareSemver(parsed, parseSemver(current)) <= 0) {
  console.error(`Tag ${tag} is not a newer semantic version than ${current}.`);
  process.exit(1);
}

for (const pkg of packages) {
  const next = pkg.raw.replace(`"version": "${pkg.version}"`, `"version": "${parsed.raw}"`);
  if (JSON.parse(next).version !== parsed.raw) {
    console.error(`Could not update version in ${pkg.dir}/package.json`);
    process.exit(1);
  }
  writeFileSync(pkg.path, next);
}

console.log(`Set ${packages.map((pkg) => pkg.name).join(", ")} from ${current} to ${parsed.raw}`);
