import {
  type ChildProcess,
  type SpawnOptions,
  spawn,
} from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import type EmbeddedPostgres from 'embedded-postgres';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const e2eClockPreload = fileURLToPath(
  new URL('./e2e-clock.mjs', import.meta.url),
);
const apiBaseUrl = 'http://127.0.0.1:8787';
export const e2eFixedTime = '2026-11-03T06:00:00.000Z';
const eventEndAt = '2026-11-04T14:00:00+09:00';
const slotScheduleJson =
  '[{"date":"2026-11-03","firstStart":"10:00","lastStart":"14:30"},{"date":"2026-11-04","firstStart":"10:00","lastStart":"13:30"}]';
const migrationsDirectory = new URL('../db/migrations/', import.meta.url);

export type E2EPostgresContext = {
  postgres: EmbeddedPostgres;
  urlFor: (database: string) => string;
  temporaryDirectory: string;
};

type ManagedProcess = {
  child: ChildProcess;
  error: Error | undefined;
};

export class E2EStack {
  readonly adminToken = randomBytes(32).toString('base64url');
  readonly agentToken = randomBytes(32).toString('base64url');
  readonly devicePath: string;
  private readonly agentBinary: string;
  private api: ManagedProcess | undefined;
  private agent: ManagedProcess | undefined;

  constructor(private readonly context: E2EPostgresContext) {
    this.devicePath = `${context.temporaryDirectory}/printer.out`;
    this.agentBinary = `${context.temporaryDirectory}/print-agent`;
  }

  async start(): Promise<void> {
    await this.applyMigrations();
    await runCommand(
      'go',
      ['build', '-o', this.agentBinary, './cmd/print-agent'],
      {
        cwd: `${projectRoot}/apps/print-agent`,
      },
    );
    await this.startApi();
    this.startAgent();
  }

  async stop(): Promise<void> {
    await stopProcess(this.agent);
    this.agent = undefined;
    await stopProcess(this.api);
    this.api = undefined;
  }

  async restartApi(): Promise<void> {
    await stopProcess(this.api);
    this.api = undefined;
    await this.startApi();
  }

  startAgent(): void {
    if (this.agent !== undefined) {
      throw new Error('Print agent is already running.');
    }
    this.agent = spawnService(this.agentBinary, [], {
      cwd: projectRoot,
      env: {
        ...process.env,
        API_BASE_URL: apiBaseUrl,
        AGENT_TOKEN: this.agentToken,
        DEVICE_PATH: this.devicePath,
      },
    });
  }

  async stopAgent(): Promise<void> {
    await stopProcess(this.agent);
    this.agent = undefined;
  }

  async ticketId(ticketNumber: number): Promise<string> {
    const client = this.context.postgres.getPgClient('postgres', '127.0.0.1');
    await client.connect();
    try {
      const result = await client.query<{ id: string }>(
        'SELECT id FROM public.tickets WHERE number = $1 ORDER BY issued_at LIMIT 1',
        [ticketNumber],
      );
      const id = result.rows[0]?.id;
      if (id === undefined) {
        throw new Error(`Ticket ${ticketNumber} was not found.`);
      }
      return id;
    } finally {
      await client.end();
    }
  }

  async ticketToken(ticketNumber: number): Promise<string> {
    const client = this.context.postgres.getPgClient('postgres', '127.0.0.1');
    await client.connect();
    try {
      const result = await client.query<{ public_token: string }>(
        'SELECT public_token FROM public.tickets WHERE number = $1 ORDER BY issued_at LIMIT 1',
        [ticketNumber],
      );
      const token = result.rows[0]?.public_token;
      if (token === undefined) {
        throw new Error(`Ticket ${ticketNumber} was not found.`);
      }
      return token;
    } finally {
      await client.end();
    }
  }

  async printJobStatuses(ticketNumber: number): Promise<string[]> {
    const client = this.context.postgres.getPgClient('postgres', '127.0.0.1');
    await client.connect();
    try {
      const result = await client.query<{ status: string }>(
        `SELECT print_jobs.status
         FROM public.print_jobs
         JOIN public.tickets ON public.tickets.id = public.print_jobs.ticket_id
         WHERE public.tickets.number = $1
         ORDER BY public.print_jobs.created_at, public.print_jobs.id`,
        [ticketNumber],
      );
      return result.rows.map(({ status }) => status);
    } finally {
      await client.end();
    }
  }

  private async applyMigrations(): Promise<void> {
    const migrationFiles = (await readdir(migrationsDirectory))
      .filter((file) => file.endsWith('.sql'))
      .sort();
    const client = this.context.postgres.getPgClient('postgres', '127.0.0.1');
    await client.connect();
    try {
      for (const file of migrationFiles) {
        const migration = await readFile(
          new URL(file, migrationsDirectory),
          'utf8',
        );
        await client.query(migration);
      }
    } finally {
      await client.end();
    }
  }

  private async startApi(): Promise<void> {
    if (this.api !== undefined) {
      throw new Error('API is already running.');
    }
    this.api = spawnService(
      process.execPath,
      ['--import', e2eClockPreload, `${projectRoot}/apps/api/src/main.ts`],
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          DATABASE_URL: this.context.urlFor('postgres'),
          ADMIN_TOKEN: this.adminToken,
          AGENT_TOKEN: this.agentToken,
          EVENT_END_AT: eventEndAt,
          E2E_FIXED_TIME: e2eFixedTime,
          SLOT_SCHEDULE_JSON: slotScheduleJson,
          TICKET_NUMBER_SCOPE: 'daily',
        },
      },
    );
    await waitForApi(this.api);
  }
}

export async function withE2EStack<T>(
  context: E2EPostgresContext,
  operation: (stack: E2EStack) => Promise<T>,
): Promise<T> {
  const stack = new E2EStack(context);
  try {
    await stack.start();
    return await operation(stack);
  } finally {
    await stack.stop();
  }
}

function spawnService(
  command: string,
  args: string[],
  options: SpawnOptions,
): ManagedProcess {
  const managed = {
    child: spawn(command, args, { stdio: 'inherit', ...options }),
    error: undefined,
  } satisfies ManagedProcess;
  managed.child.once('error', (error) => {
    managed.error = error;
  });
  return managed;
}

function runCommand(
  command: string,
  args: string[],
  options: SpawnOptions,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(`${command} exited with ${signal ?? `code ${code}`}.`),
        );
    });
  });
}

function waitForExit(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    child.once('exit', () => resolve());
    if (child.exitCode !== null || child.signalCode !== null) resolve();
  });
}

async function stopProcess(process: ManagedProcess | undefined): Promise<void> {
  if (
    process === undefined ||
    process.error !== undefined ||
    process.child.exitCode !== null ||
    process.child.signalCode !== null
  ) {
    return;
  }
  const exited = waitForExit(process.child);
  process.child.kill('SIGTERM');
  let timer: NodeJS.Timeout | undefined;
  const stopped = await Promise.race([
    exited.then(() => true),
    new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), 5_000);
    }),
  ]);
  if (timer !== undefined) clearTimeout(timer);
  if (!stopped) {
    process.child.kill('SIGKILL');
    await exited;
  }
}

async function waitForApi(process: ManagedProcess): Promise<void> {
  const deadline = Date.now() + 30_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (process.error !== undefined) {
      throw new Error(`API process could not start: ${process.error.message}`, {
        cause: process.error,
      });
    }
    if (process.child.exitCode !== null || process.child.signalCode !== null) {
      throw new Error(
        `API process exited before readiness (code ${process.child.exitCode}, signal ${process.child.signalCode}).`,
      );
    }
    try {
      const response = await fetch(`${apiBaseUrl}/api/readyz`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.status === 200) return;
      await response.body?.cancel();
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error('API did not become ready within 30 seconds.', {
    cause: lastError,
  });
}
