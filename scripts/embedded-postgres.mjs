import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

export async function withTemporaryPostgres(operation) {
  const temporaryDirectory = await mkdtemp(
    join(process.env.TMPDIR ?? tmpdir(), 'bunkasai-ticket-postgres-'),
  );
  const port = await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (address === null || typeof address === 'string') {
        probe.close(() => reject(new Error('一時ポートを取得できません。')));
        return;
      }
      probe.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });
  const password = randomBytes(32).toString('base64url');
  const postgres = new EmbeddedPostgres({
    databaseDir: join(temporaryDirectory, 'data'),
    user: 'postgres',
    password,
    port,
    persistent: false,
    autoRehydrateSymlinks: true,
  });
  let started = false;

  try {
    await postgres.initialise();
    await postgres.start();
    started = true;
    const urlFor = (database) =>
      `postgres://postgres:${password}@127.0.0.1:${port}/${database}?sslmode=disable`;
    await operation({ postgres, urlFor, temporaryDirectory });
  } finally {
    try {
      if (started) await postgres.stop();
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }
}
