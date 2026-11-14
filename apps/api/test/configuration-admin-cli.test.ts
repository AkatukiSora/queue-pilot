import { describe, expect, it } from 'vitest';
import { parseConfigurationAdminArguments } from '../../../scripts/configuration-admin.ts';

describe('parseConfigurationAdminArguments', () => {
  it('accepts a dry-run import without exposing identity values in arguments', () => {
    expect(
      parseConfigurationAdminArguments([
        'import-export',
        '--file',
        'snapshot.json',
        '--dry-run',
      ]),
    ).toEqual({
      command: 'import-export',
      options: new Map<string, string | true>([
        ['--file', 'snapshot.json'],
        ['--dry-run', true],
      ]),
    });
  });

  it('rejects duplicate options instead of silently choosing one', () => {
    expect(() =>
      parseConfigurationAdminArguments([
        'export',
        '--tenant-slug',
        'alpha',
        '--tenant-slug',
        'beta',
        '--file',
        'snapshot.json',
      ]),
    ).toThrow('Option --tenant-slug was provided more than once.');
  });

  it('requires the export destination before database settings are resolved', () => {
    expect(() =>
      parseConfigurationAdminArguments(['export', '--tenant-slug', 'alpha']),
    ).toThrow('Option --file is required.');
  });

  it('rejects an unknown option before any database connection is opened', () => {
    expect(() =>
      parseConfigurationAdminArguments([
        'initialize-web',
        '--owner-password',
        'secret',
      ]),
    ).toThrow('Unknown option --owner-password.');
  });
});
