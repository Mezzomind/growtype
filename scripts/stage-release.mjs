// Stages the packed tarballs with `npm stage publish`. Skips a package when that version
// is already on npm or already waiting for approval, so a rerun can finish the release.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const packages = ["packages/core", "packages/react"].map((dir) => {
  const pkg = JSON.parse(readFileSync(new URL(`../${dir}/package.json`, import.meta.url), "utf8"));
  return { name: pkg.name, version: pkg.version };
});

function npm(args) {
  return spawnSync("npm", args, { encoding: "utf8" });
}

function fail(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

for (const pkg of packages) {
  const spec = `${pkg.name}@${pkg.version}`;
  const published = npm(["view", spec, "version"]);
  if (published.status === 0 && published.stdout.trim() === pkg.version) {
    console.log(`${spec} is already on npm, skipping`);
    continue;
  }

  const staged = npm(["stage", "list", pkg.name, "--json"]);
  if (staged.status !== 0) fail(staged);
  const start = staged.stdout.indexOf("[");
  const end = staged.stdout.lastIndexOf("]");
  if (start === -1 || end === -1) {
    console.error(`npm stage list did not return a JSON list:\n${staged.stdout}`);
    process.exit(1);
  }
  const items = JSON.parse(staged.stdout.slice(start, end + 1));
  if (items.some((item) => item.packageName === pkg.name && item.version === pkg.version)) {
    console.log(`${spec} is already staged, skipping`);
    continue;
  }

  const tarball = `.release/${pkg.name.replace(/^@/, "").replaceAll("/", "-")}-${pkg.version}.tgz`;
  const publish = npm(["stage", "publish", tarball, "--access", "public"]);
  if (publish.stdout) process.stdout.write(publish.stdout);
  if (publish.stderr) process.stderr.write(publish.stderr);
  if (publish.status !== 0) process.exit(publish.status ?? 1);
  console.log(`${spec} staged — approve with: npm stage approve ${spec}`);
}
