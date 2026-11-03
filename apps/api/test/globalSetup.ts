import { randomBytes } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';
import type { TestProject } from 'vitest/node';

const migrationDirectory = fileURLToPath(
  new URL('../../../db/migrations/', import.meta.url),
);

async function setup(project: TestProject) {
  const externalUrl = process.env.TEST_DATABASE_URL;
  const databaseName = `bunkasai_test_${randomBytes(8).toString('hex')}`;
  let temporaryDirectory: string | undefined;
  let postgres: EmbeddedPostgres | undefined;
  let adminClient: Client | undefined;
  let serverStarted = false;
  let databaseCreated = false;
  let databaseUrl: string;

  const cleanup = async () => {
    try {
      if (databaseCreated) {
        if (externalUrl !== undefined) {
          await adminClient?.query(`DROP DATABASE "${databaseName}"`);
        } else {
          await postgres?.dropDatabase(databaseName);
        }
      }
    } finally {
      try {
        await adminClient?.end();
      } finally {
        try {
          if (serverStarted) await postgres?.stop();
        } finally {
          if (temporaryDirectory !== undefined) {
            await rm(temporaryDirectory, { recursive: true, force: true });
          }
        }
      }
    }
  };

  let ready = false;
  try {
    if (externalUrl !== undefined) {
      const adminUrl = new URL(externalUrl);
      if (adminUrl.pathname.length < 2) {
        throw new Error('TEST_DATABASE_URL にデータベース名がありません。');
      }
      adminClient = new Client({ connectionString: externalUrl });
      await adminClient.connect();
      await adminClient.query(`CREATE DATABASE "${databaseName}"`);
      databaseCreated = true;
      adminUrl.pathname = `/${databaseName}`;
      databaseUrl = adminUrl.toString();
    } else {
      if (process.getuid?.() === 0) {
        throw new Error('embedded-postgres は root で実行できません。');
      }
      temporaryDirectory = await mkdtemp(
        join(process.env.TMPDIR ?? tmpdir(), 'bunkasai-ticket-test-'),
      );
      const port = await new Promise<number>((resolve, reject) => {
        const probe = createServer();
        probe.once('error', reject);
        probe.listen(0, '127.0.0.1', () => {
          const address = probe.address();
          if (address === null || typeof address === 'string') {
            probe.close(() =>
              reject(new Error('一時ポートを取得できません。')),
            );
            return;
          }
          probe.close((error) => {
            if (error) reject(error);
            else resolve(address.port);
          });
        });
      });
      const password = randomBytes(32).toString('base64url');
      postgres = new EmbeddedPostgres({
        databaseDir: join(temporaryDirectory, 'data'),
        user: 'postgres',
        password,
        port,
        persistent: false,
        autoRehydrateSymlinks: true,
      });
      await postgres.initialise();
      await postgres.start();
      serverStarted = true;
      await postgres.createDatabase(databaseName);
      databaseCreated = true;
      const embeddedUrl = new URL(
        `postgres://postgres@127.0.0.1:${port}/${databaseName}?sslmode=disable`,
      );
      embeddedUrl.password = password;
      databaseUrl = embeddedUrl.toString();
    }

    const testClient = new Client({ connectionString: databaseUrl });
    await testClient.connect();
    try {
      const version = await testClient.query('SHOW server_version');
      if (!String(version.rows[0]?.server_version).startsWith('18.6')) {
        throw new Error(
          `PostgreSQL 18.6 が必要です。実際のバージョン: ${String(version.rows[0]?.server_version)}`,
        );
      }
      const migrations = (await readdir(migrationDirectory))
        .filter((file) => file.endsWith('.sql'))
        .sort();
      for (const migration of migrations) {
        await testClient.query(
          await readFile(join(migrationDirectory, migration), 'utf8'),
        );
      }
    } finally {
      await testClient.end();
    }

    project.provide('testDatabaseUrl', databaseUrl);
    console.log(
      `Integration tests use PostgreSQL 18.6 (${externalUrl === undefined ? 'embedded' : 'TEST_DATABASE_URL'}), isolated database ${databaseName}.`,
    );
    ready = true;
  } finally {
    if (!ready) await cleanup();
  }

  return cleanup;
}

export default setup;
