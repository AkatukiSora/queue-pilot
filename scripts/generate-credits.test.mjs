import assert from 'node:assert/strict';
import test from 'node:test';
import { assertAllowedLicense } from './generate-credits.mjs';

test('accepts licenses explicitly included in the permissive allowlist', () => {
  assert.equal(assertAllowedLicense('MIT', 'example-package'), 'MIT');
  assert.equal(
    assertAllowedLicense('BSD-3-Clause', 'example-module'),
    'BSD-3-Clause',
  );
});

test('rejects copyleft and other licenses outside the allowlist', () => {
  assert.throws(
    () => assertAllowedLicense('GPL-3.0-only', 'copyleft-package'),
    /GPL-3\.0-only.*not allowlisted/,
  );
});

test('rejects missing and compound SPDX licenses until explicitly reviewed', () => {
  assert.throws(
    () => assertAllowedLicense(null, 'unknown-package'),
    /unknown-package.*unknown license/,
  );
  assert.throws(
    () => assertAllowedLicense('MIT OR GPL-3.0-only', 'compound-package'),
    /compound-package.*not allowlisted/,
  );
});
