import { spawn } from 'node:child_process';

export const migrationDirectory = 'file://db/migrations';

export function databaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL が必要です。');
  }
  return url;
}

export function runCommand(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(' ')} が失敗しました (${signal ? `signal ${signal}` : `exit ${code}`})`,
        ),
      );
    });
  });
}

export function runAtlas(args, env = process.env) {
  return runCommand('atlas', args, env);
}
