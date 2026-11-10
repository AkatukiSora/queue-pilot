import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));
const rehearsalPath = resolve(
  repositoryRoot,
  'scripts/prod-bootstrap-rehearsal.mjs',
);
const tlsFailurePreloadUrl = pathToFileURL(
  resolve(
    repositoryRoot,
    'scripts/prod-bootstrap-rehearsal-disable-tls-test-preload.mjs',
  ),
).href;
const temporaryRoot = await mkdtemp(
  resolve(tmpdir(), 'queue-pilot-rehearsal-regression-'),
);

function runRehearsal(disableTls) {
  const argumentsList = disableTls
    ? ['--import', tlsFailurePreloadUrl, rehearsalPath]
    : [rehearsalPath];
  const result = spawnSync(process.execPath, argumentsList, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 10 * 1024 * 1024,
    env: {
      ...process.env,
      TMPDIR: temporaryRoot,
    },
  });
  if (result.error) throw result.error;
  return result;
}

try {
  const successfulRun = runRehearsal(false);
  const successfulOutput = `${successfulRun.stdout ?? ''}${successfulRun.stderr ?? ''}`;
  assert.equal(
    successfulRun.status,
    0,
    `The normal rehearsal process must succeed:\n${successfulOutput}`,
  );
  for (const assertion of [
    'TLS assertion passed: trusted CA connection.',
    'TLS assertion passed: wrong CA rejected.',
    'TLS assertion passed: hostname mismatch rejected.',
    'Database bootstrap rehearsal passed:',
  ]) {
    assert(
      successfulOutput.includes(assertion),
      `The successful process must report ${assertion}`,
    );
  }
  assert.deepEqual(
    await readdir(temporaryRoot),
    [],
    'The successful rehearsal must remove its temporary database directory.',
  );
  for (const line of (successfulRun.stdout ?? '').split(/\r?\n/)) {
    if (
      line.includes('TLS assertion passed:') ||
      line.includes('Database bootstrap rehearsal passed:')
    ) {
      console.log(line);
    }
  }

  const failedRun = runRehearsal(true);
  const failedOutput = `${failedRun.stdout ?? ''}${failedRun.stderr ?? ''}`;
  assert.notEqual(
    failedRun.status,
    0,
    `A non-TLS connection must fail the process:\n${failedOutput}`,
  );
  assert(
    failedOutput.includes('PostgreSQL TLS readiness was not confirmed'),
    `The injected non-TLS connection must fail the readiness check:\n${failedOutput}`,
  );
  assert(
    !failedOutput.includes('Database bootstrap rehearsal passed:'),
    'A failed rehearsal must not print its completion marker.',
  );
  assert.deepEqual(
    await readdir(temporaryRoot),
    [],
    'The failed rehearsal must remove its temporary database directory.',
  );
  console.log(
    'Intentional non-TLS connection exited non-zero without a completion marker and cleaned the temporary database.',
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
