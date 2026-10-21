// Stages the packed tarballs with `npm stage publish`. Skips a package when that version
// is already on npm, so a rerun can finish the release. Only `npm stage publish` gets
// trusted publishing (OIDC) credentials; other authenticated calls such as `npm stage list`
// would fail with 401, so the script sticks to anonymous reads plus the publish itself.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const packages = ["packages/core", "packages/react"].map((dir) => {
  const pkg = JSON.parse(readFileSync(new URL(`../${dir}/package.json`, import.meta.url), "utf8"));
  return { name: pkg.name, version: pkg.version };
});

function npm(args) {
  return spawnSync("npm", args, { encoding: "utf8" });
}

for (const pkg of packages) {
  const spec = `${pkg.name}@${pkg.version}`;
  const published = npm(["view", spec, "version"]);
  if (published.status === 0 && published.stdout.trim() === pkg.version) {
    console.log(`${spec} is already on npm, skipping`);
    continue;
  }

  const tarball = `.release/${pkg.name.replace(/^@/, "").replaceAll("/", "-")}-${pkg.version}.tgz`;
  const command = pkg.name.includes("react") ? ["publish", tarball, "--access", "public"] : ["stage", "publish", tarball, "--access", "public"];
  const publish = npm([...command, '--loglevel', 'verbose']);
  if (publish.stdout) process.stdout.write(publish.stdout);
  if (publish.stderr) process.stderr.write(publish.stderr);
  if (publish.status !== 0) process.exit(publish.status ?? 1);
  console.log(`${spec} staged — approve with: npm stage approve ${spec}`);
}
