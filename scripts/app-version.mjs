#!/usr/bin/env node

const semVerTagPattern =
  /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function deriveAppVersion(refName, commit, requireSemVer = false) {
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    throw new Error('APP_COMMIT must be a 40-character lowercase Git SHA.');
  }

  if (semVerTagPattern.test(refName)) {
    return { version: refName.slice(1), commit };
  }
  if (requireSemVer) {
    throw new Error(`Release tag is not SemVer: ${refName}`);
  }

  return { version: `0.0.0-dev+${commit.slice(0, 7)}`, commit };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [, , refName, commit, option, ...extra] = process.argv;
  if (refName === undefined || commit === undefined || extra.length > 0) {
    throw new Error(
      'Usage: node scripts/app-version.mjs <ref-name> <40-character-sha> [--require-semver]',
    );
  }
  if (option !== undefined && option !== '--require-semver') {
    throw new Error(`Unknown option: ${option}`);
  }

  const { version, commit: appCommit } = deriveAppVersion(
    refName,
    commit,
    option === '--require-semver',
  );
  process.stdout.write(`app_version=${version}\napp_commit=${appCommit}\n`);
}
