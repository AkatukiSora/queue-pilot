import { isIP } from 'node:net';
import { isAbsolute } from 'node:path';
import { z } from 'zod';

export const databaseEnvironmentSchema = z.object({
  DATABASE_URL: z.string().optional(),
  DB_HOST: z.string().optional(),
  DB_PORT: z.string().optional(),
  DB_NAME: z.string().optional(),
  DB_USER: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  DB_SSLMODE: z.string().optional(),
  DB_SSLROOTCERT: z.string().optional(),
});

const componentKeys = [
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'DB_SSLMODE',
  'DB_SSLROOTCERT',
] as const;

function invalidDatabaseEnvironment(reason: string): never {
  throw new Error(`Invalid database environment: ${reason}.`);
}

function hasWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (Number.isNaN(next) || next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function isDatabaseHost(value: string): boolean {
  if (value.startsWith('[') && value.endsWith(']')) {
    return isIP(value.slice(1, -1)) === 6;
  }
  if (isIP(value) === 4) return true;
  if (
    value.length > 253 ||
    /^\d+(?:\.\d+){3}$/.test(value) ||
    !/^[A-Za-z0-9.-]+$/.test(value)
  ) {
    return false;
  }
  const hostname = value.endsWith('.') ? value.slice(0, -1) : value;
  return (
    hostname.length > 0 &&
    hostname
      .split('.')
      .every(
        (label) =>
          label.length <= 63 &&
          /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label),
      )
  );
}

export function loadDatabaseUrl(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const parsed = databaseEnvironmentSchema.safeParse(environment);
  if (!parsed.success) {
    const invalidKeys = [
      ...new Set(
        parsed.error.issues
          .map((issue) => issue.path[0])
          .filter((key): key is string => typeof key === 'string'),
      ),
    ].sort();
    invalidDatabaseEnvironment(
      `invalid value for ${invalidKeys.join(', ') || 'database settings'}`,
    );
  }

  const values = parsed.data;
  const hasComponents = componentKeys.some((key) => values[key] !== undefined);

  if (values.DATABASE_URL !== undefined) {
    if (hasComponents) {
      invalidDatabaseEnvironment(
        'DATABASE_URL cannot be combined with DB_* settings',
      );
    }
    const connectionString = values.DATABASE_URL;
    if (!URL.canParse(connectionString)) {
      invalidDatabaseEnvironment(
        'DATABASE_URL must be a PostgreSQL connection URL',
      );
    }
    const protocol = new URL(connectionString).protocol;
    if (protocol !== 'postgres:' && protocol !== 'postgresql:') {
      invalidDatabaseEnvironment(
        'DATABASE_URL must use postgres: or postgresql:',
      );
    }
    return connectionString;
  }

  if (!hasComponents) {
    invalidDatabaseEnvironment(
      'DATABASE_URL or the complete DB_HOST, DB_PORT, DB_NAME, DB_USER, and DB_PASSWORD set is required',
    );
  }

  const missingKeys = (
    ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'] as const
  ).filter((key) => values[key] === undefined);
  if (missingKeys.length > 0) {
    invalidDatabaseEnvironment(
      `required keys are missing: ${missingKeys.join(', ')}`,
    );
  }

  // The required-key check above is the runtime boundary for this refinement.
  const components = values as typeof values & {
    DB_HOST: string;
    DB_PORT: string;
    DB_NAME: string;
    DB_USER: string;
    DB_PASSWORD: string;
  };
  const host = components.DB_HOST;
  if (!isDatabaseHost(host)) {
    invalidDatabaseEnvironment(
      'DB_HOST must be a DNS name, IPv4 address, or bracketed IPv6 address',
    );
  }

  const portText = components.DB_PORT;
  if (!/^\d+$/.test(portText)) {
    invalidDatabaseEnvironment('DB_PORT must contain decimal digits only');
  }
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    invalidDatabaseEnvironment(
      'DB_PORT must be an integer from 1 through 65535',
    );
  }

  const database = components.DB_NAME;
  if (!/^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(database)) {
    invalidDatabaseEnvironment(
      'DB_NAME must be a portable database identifier',
    );
  }

  const username = components.DB_USER;
  if (
    username.length === 0 ||
    username.includes('\u0000') ||
    !hasWellFormedUnicode(username)
  ) {
    invalidDatabaseEnvironment(
      'DB_USER must be non-empty, contain no NUL, and use well-formed Unicode',
    );
  }

  const password = components.DB_PASSWORD;
  if (
    password.length === 0 ||
    password.includes('\u0000') ||
    !hasWellFormedUnicode(password)
  ) {
    invalidDatabaseEnvironment(
      'DB_PASSWORD must be non-empty, contain no NUL, and use well-formed Unicode',
    );
  }

  const sslMode = values.DB_SSLMODE ?? 'verify-full';
  if (!['disable', 'require', 'verify-full'].includes(sslMode)) {
    invalidDatabaseEnvironment(
      'DB_SSLMODE must be disable, require, or verify-full',
    );
  }

  const rootCertificate = values.DB_SSLROOTCERT;
  if (
    rootCertificate !== undefined &&
    (rootCertificate.length === 0 || !isAbsolute(rootCertificate))
  ) {
    invalidDatabaseEnvironment(
      'DB_SSLROOTCERT must be a non-empty absolute file path',
    );
  }
  if (sslMode === 'disable' && rootCertificate !== undefined) {
    invalidDatabaseEnvironment(
      'DB_SSLROOTCERT cannot be used with DB_SSLMODE=disable',
    );
  }

  const url = new URL('postgresql://localhost/');
  url.hostname = host;
  url.port = String(port);
  url.pathname = `/${database}`;
  url.username = encodeURIComponent(username);
  url.password = encodeURIComponent(password);
  url.searchParams.set('sslmode', sslMode);
  if (rootCertificate !== undefined) {
    url.searchParams.set('sslrootcert', rootCertificate);
  }
  return url.href;
}
