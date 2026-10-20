// Both publishable packages share one semantic version. semantic-release writes it.
import { readFileSync } from "node:fs";

const semver =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?$/;

const packages = ["packages/core", "packages/react"].map((dir) => {
  const pkg = JSON.parse(readFileSync(new URL(`../${dir}/package.json`, import.meta.url), "utf8"));
  if (!semver.test(pkg.version)) {
    console.error(`${pkg.name}: ${pkg.version} is not a semantic version`);
    process.exit(1);
  }
  return { name: pkg.name, version: pkg.version };
});

const versions = new Set(packages.map((pkg) => pkg.version));
if (versions.size !== 1) {
  console.error(
    "Package versions differ:",
    packages.map((pkg) => `${pkg.name}@${pkg.version}`).join(", "),
  );
  process.exit(1);
}

console.log(`OK: ${packages.map((pkg) => pkg.name).join(", ")} at ${packages[0].version}`);
