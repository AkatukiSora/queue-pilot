import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const runtimeDirectory =
  process.env.PRINT_AGENT_RUNTIME_DIRECTORY ?? '/run/queue-pilot-agent';
const token = (await readFile(join(runtimeDirectory, 'token'), 'utf8')).trim();
const printerId = (
  await readFile(join(runtimeDirectory, 'printer-id'), 'utf8')
).trim();
if (
  token.length < 32 ||
  /\s/.test(token) ||
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    printerId,
  )
) {
  throw new Error('The local preview-agent bootstrap files are invalid.');
}
const sourceConfig = process.env.PRINT_AGENT_CONFIG_PATH;
if (!sourceConfig) throw new Error('PRINT_AGENT_CONFIG_PATH is required.');
const config = JSON.parse(await readFile(sourceConfig, 'utf8'));
config.printerId = printerId;
const runtimeConfig = '/tmp/print-agent-config.json';
await writeFile(runtimeConfig, JSON.stringify(config), { mode: 0o600 });
const agent = spawn(process.env.PRINT_AGENT_BINARY_PATH ?? '/print-agent', [], {
  env: {
    ...process.env,
    AGENT_TOKEN: token,
    PRINT_AGENT_CONFIG_PATH: runtimeConfig,
  },
  stdio: 'inherit',
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => agent.kill(signal));
}
agent.once('error', (error) => {
  console.error(`Could not start the print agent: ${error.name}.`);
  process.exitCode = 1;
});
agent.once('close', (code, signal) => {
  if (signal !== null) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
