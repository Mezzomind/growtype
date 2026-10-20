// Semantic versions as used by npm: MAJOR.MINOR.PATCH with an optional prerelease.
// Build metadata is rejected so the version is something npm will accept.
// https://semver.org

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?$/;

export function parseSemver(version) {
  const match = SEMVER.exec(version);
  if (!match) {
    throw new Error(
      `Not a semantic version: ${version} (expected MAJOR.MINOR.PATCH or MAJOR.MINOR.PATCH-prerelease)`,
    );
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    pre: match[4] ? match[4].split(".") : null,
    raw: version,
  };
}

function compareIdentifiers(a, b) {
  const aNum = /^[0-9]+$/.test(a);
  const bNum = /^[0-9]+$/.test(b);
  if (aNum && bNum) {
    const diff = Number(a) - Number(b);
    return diff < 0 ? -1 : diff > 0 ? 1 : 0;
  }
  if (aNum) return -1;
  if (bNum) return 1;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function comparePrerelease(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    const diff = compareIdentifiers(a[i], b[i]);
    if (diff) return diff;
  }
  return 0;
}

/** @returns {-1 | 0 | 1} */
export function compareSemver(a, b) {
  for (const part of ["major", "minor", "patch"]) {
    if (a[part] !== b[part]) return a[part] < b[part] ? -1 : 1;
  }
  return comparePrerelease(a.pre, b.pre);
}

export function parseReleaseTag(tag) {
  if (!tag.startsWith("v")) {
    throw new Error(`Tag ${tag} must be a semantic version prefixed with v, like v1.2.3`);
  }
  return parseSemver(tag.slice(1));
}
