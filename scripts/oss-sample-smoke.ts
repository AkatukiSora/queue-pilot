import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../apps/api/src/config.ts';

const root = process.cwd();
const composeFile = join(root, 'compose.yaml');
const manifestOidc = join(root, 'deploy/examples/compose/tenant-manifest.json');
const manifestGithub = join(
  root,
  'deploy/examples/compose/tenant-manifest-github.json',
);
const environment = {
  COMPOSE_POSTGRES_OWNER_PASSWORD: randomBytes(32).toString('hex'),
  COMPOSE_RUNTIME_DB_PASSWORD: randomBytes(32).toString('hex'),
  COMPOSE_AUTH_SECRET: randomBytes(32).toString('hex'),
  COMPOSE_OIDC_CLIENT_SECRET: randomBytes(32).toString('hex'),
  COMPOSE_GITHUB_CLIENT_ID: 'sample-github-client-id',
  COMPOSE_GITHUB_CLIENT_SECRET: 'sample-github-client-secret',
  COMPOSE_API_BASE_URL: 'http://oidc-mock:8787',
};
const temporaryRoot = process.env.TMPDIR ?? '/opt/data/cache/scratch';
await mkdir(temporaryRoot, { recursive: true });
const temporaryDirectory = await mkdtemp(
  join(temporaryRoot, 'queue-pilot-oss-'),
);
const envFile = join(temporaryDirectory, '.env.compose');
const project = `queue-pilot-oss-${randomBytes(6).toString('hex')}`;
await writeFile(
  envFile,
  `${Object.entries(environment)
    .map(([name, value]) => `${name}=${value}`)
    .join('\n')}\n`,
  { mode: 0o600 },
);
let dockerAvailable = false;

try {
  for (const profile of ['local-oidc', 'github'] as const) {
    const provider = profile === 'local-oidc' ? 'oidc' : 'github';
    const configureService =
      profile === 'local-oidc' ? 'configure-local-oidc' : 'configure-github';
    const runtimeService =
      profile === 'local-oidc' ? 'api-local-oidc' : 'api-github';
    const manifestPath = provider === 'oidc' ? manifestOidc : manifestGithub;
    const rendered = JSON.parse(
      runDocker(
        [...composeArguments([profile]), 'config', '--format', 'json'],
        30_000,
      ),
    ) as {
      services: Record<
        string,
        { environment?: Record<string, string> | undefined }
      >;
    };
    assertProviderConfiguration(
      provider,
      manifestPath,
      rendered.services[configureService]?.environment,
      rendered.services[runtimeService]?.environment,
    );
  }
  console.log(
    'Local OIDC and GitHub Compose profiles passed configuration validation.',
  );
  const config = composeArguments(['local-oidc', 'json-file']);
  runDocker([...config, 'config', '--quiet'], 30_000);
  if (!dockerDaemonAvailable()) {
    console.log(
      'Compose runtime start was not verified because the Docker daemon is unavailable.',
    );
  } else {
    dockerAvailable = true;
    console.log('Compose configuration and Docker daemon are available.');

    runDocker([...config, 'up', '--build', '--detach', '--wait'], 15 * 60_000);
    const issuer = await fetchJson(
      'http://127.0.0.1:8080/.well-known/openid-configuration',
    );
    assert(
      issuer.issuer === 'http://localhost:8080',
      'Local OIDC issuer metadata did not match the configured public issuer.',
    );
    const readiness = await fetch('http://127.0.0.1:8787/api/readyz', {
      signal: AbortSignal.timeout(10_000),
    });
    assert(
      readiness.ok,
      'The Compose API readiness endpoint did not return 2xx.',
    );
    await waitForPreview(config);
    console.log(
      `Compose runtime passed: project=${project}; PostgreSQL, API, mock OIDC, and JSON preview agent started; one preview file was produced.`,
    );
  }
} finally {
  if (dockerAvailable)
    runDocker(
      [...composeArguments(), 'down', '--volumes', '--remove-orphans'],
      60_000,
    );
  await rm(temporaryDirectory, { recursive: true, force: true });
}

function composeArguments(profiles = ['local-oidc', 'json-file']): string[] {
  return [
    'compose',
    '--project-name',
    project,
    '--file',
    composeFile,
    '--env-file',
    envFile,
    ...profiles.flatMap((profile) => ['--profile', profile]),
  ];
}

function dockerDaemonAvailable(): boolean {
  const result = spawnSync(
    'docker',
    ['info', '--format', '{{.ServerVersion}}'],
    {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15_000,
    },
  );
  if (result.error)
    throw new Error(`Could not run docker info: ${result.error.name}.`);
  const output = `${result.stdout}\n${result.stderr}`;
  if (/Cannot connect to the Docker daemon/i.test(output)) return false;
  if (result.status === 0 && result.stdout.trim() !== '') return true;
  throw new Error(
    `Docker daemon probe failed with ${result.signal ?? `exit ${result.status}`}.`,
  );
}

function runDocker(args: string[], timeout: number): string {
  const result = spawnSync('docker', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout,
  });
  if (result.error) {
    throw new Error(
      `Could not run docker ${args[0] ?? 'command'}: ${result.error.name}.`,
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `docker ${args[0] ?? 'command'} failed with ${result.signal ?? `exit ${result.status}`}.`,
    );
  }
  return result.stdout;
}

function assertProviderConfiguration(
  provider: 'github' | 'oidc',
  manifestPath: string,
  configureEnvironment: Record<string, string> | undefined,
  runtimeEnvironment: Record<string, string> | undefined,
): void {
  assert(
    configureEnvironment !== undefined && runtimeEnvironment !== undefined,
    `The ${provider} Compose profile is missing its configure or runtime service.`,
  );
  const configureConfig = loadConfig({
    ...configureEnvironment,
    APP_MANIFEST_PATH: manifestPath,
  });
  const runtimeConfig = loadConfig({
    ...runtimeEnvironment,
    APP_MANIFEST_PATH: manifestPath,
  });
  assert(
    configureConfig.sharedAuth?.provider.kind === provider &&
      runtimeConfig.sharedAuth?.provider.kind === provider,
    `The ${provider} configure and runtime services do not share the expected authentication contract.`,
  );
}

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  assert(response.ok, `HTTP endpoint returned ${response.status}.`);
  const value: unknown = await response.json();
  assert(
    typeof value === 'object' && value !== null,
    'Expected a JSON object.',
  );
  return value as Record<string, unknown>;
}

async function waitForPreview(config: string[]): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const count = runDocker(
      [
        ...config,
        'exec',
        '--index',
        '1',
        'agent-json-file',
        'node',
        '-e',
        "import('node:fs/promises').then(async (fs)=>console.log((await fs.readdir('/var/lib/print-agent/previews')).filter((name)=>name.endsWith('.json')).length))",
      ],
      10_000,
    );
    if (Number(count.trim()) > 0) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000));
  }
  throw new Error(
    'The JSON preview agent did not write a preview within 30 seconds.',
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
