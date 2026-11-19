import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveAppVersion } from './app-version.mjs';

const commit = '0123456789abcdef0123456789abcdef01234567';

test('derives SemVer release and development versions', async (suite) => {
  const cases = [
    ['v0.0.0', '0.0.0'],
    ['v1.2.3', '1.2.3'],
    ['v10.20.30', '10.20.30'],
    ['v1.2.3-rc.1', '1.2.3-rc.1'],
    ['v1.2.3-alpha', '1.2.3-alpha'],
    ['v1.2.3-0', '1.2.3-0'],
    ['v1.2.3+build.7', '1.2.3+build.7'],
    ['v1.2.3-rc.1+build.7', '1.2.3-rc.1+build.7'],
    ['main', '0.0.0-dev+0123456'],
    ['feature/test', '0.0.0-dev+0123456'],
    ['v01.2.3', '0.0.0-dev+0123456'],
    ['v1.02.3', '0.0.0-dev+0123456'],
    ['v1.2.03', '0.0.0-dev+0123456'],
    ['v1.2.3-01', '0.0.0-dev+0123456'],
    ['v1.2', '0.0.0-dev+0123456'],
  ];

  for (const [ref, version] of cases) {
    await suite.test(`${ref} -> ${version}`, () => {
      assert.deepEqual(deriveAppVersion(ref, commit), {
        version,
        commit,
      });
    });
  }
});

test('rejects invalid commit IDs and invalid release tags in strict mode', () => {
  assert.throws(() => deriveAppVersion('main', '0123'), /40-character/);
  assert.throws(() => deriveAppVersion('v1.2.3-01', commit, true), /SemVer/);
});
