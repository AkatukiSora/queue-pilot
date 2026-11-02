import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const argumentsList = process.argv.slice(2);
const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let contextRoot = scriptRoot;
let dockerfiles = ['Dockerfile', 'Dockerfile.migrate'];
let customDockerfile = false;

for (let index = 0; index < argumentsList.length; index += 1) {
  const argument = argumentsList[index];
  if (argument === '--context') {
    const value = argumentsList[index + 1];
    if (value === undefined) throw new Error('--context requires a path');
    contextRoot = resolve(value);
    index += 1;
  } else if (argument === '--dockerfile') {
    const value = argumentsList[index + 1];
    if (value === undefined) throw new Error('--dockerfile requires a path');
    dockerfiles = [value];
    customDockerfile = true;
    index += 1;
  } else {
    throw new Error(`Unknown argument: ${argument}`);
  }
}

const errors = [];
let checkedCopies = 0;
for (const dockerfile of dockerfiles) {
  const dockerfilePath = resolve(contextRoot, dockerfile);
  if (!existsSync(dockerfilePath)) {
    errors.push(`${dockerfile}: Dockerfile does not exist`);
    continue;
  }

  const content = readFileSync(dockerfilePath, 'utf8');
  for (const [lineIndex, rawLine] of content.split('\n').entries()) {
    const line = rawLine.trim();
    const from = line.match(/^FROM\s+(\S+)(?:\s+AS\s+(\S+))?$/i);
    if (from && !/@sha256:[a-f0-9]{64}$/i.test(from[1])) {
      errors.push(
        `${dockerfile}:${lineIndex + 1}: FROM image is not pinned by digest: ${from[1]}`,
      );
    }

    const copy = line.match(/^COPY\s+(.+)$/i);
    if (!copy) continue;
    const tokens = copy[1].split(/\s+/);
    if (
      tokens.some((token) => token === '--from' || token.startsWith('--from='))
    )
      continue;
    const operands = tokens.filter((token) => !token.startsWith('--'));
    const sources = operands.slice(0, -1);
    if (sources.length === 0) {
      errors.push(`${dockerfile}:${lineIndex + 1}: COPY has no source path`);
      continue;
    }

    for (const source of sources) {
      checkedCopies += 1;
      if (
        source.includes('*') ||
        source.includes('?') ||
        source.includes('[') ||
        source.includes(']')
      ) {
        errors.push(
          `${dockerfile}:${lineIndex + 1}: glob COPY paths are not checked: ${source}`,
        );
        continue;
      }
      const sourcePath = resolve(contextRoot, source);
      const relativePath = relative(contextRoot, sourcePath);
      if (
        isAbsolute(source) ||
        relativePath === '..' ||
        relativePath.startsWith(`..${sep}`)
      ) {
        errors.push(
          `${dockerfile}:${lineIndex + 1}: COPY source escapes the build context: ${source}`,
        );
      } else if (!existsSync(sourcePath)) {
        errors.push(
          `${dockerfile}:${lineIndex + 1}: COPY source does not exist: ${source}`,
        );
      }
    }
  }
}

if (!customDockerfile) {
  const apiMainPath = resolve(contextRoot, 'apps/api/src/main.ts');
  if (!existsSync(apiMainPath)) {
    errors.push('apps/api/src/main.ts: API entrypoint does not exist');
  } else {
    const apiMain = readFileSync(apiMainPath, 'utf8');
    const staticRoot = apiMain.match(
      /staticRoot:\s*fileURLToPath\(new URL\(['"]([^'"]+)['"],\s*import\.meta\.url\)\)/,
    );
    if (!staticRoot) {
      errors.push(
        'apps/api/src/main.ts: staticRoot path expression was not found',
      );
    } else {
      const resolvedStaticRoot = resolve(dirname(apiMainPath), staticRoot[1]);
      const relativeStaticRoot = relative(contextRoot, resolvedStaticRoot)
        .split(sep)
        .join('/');
      if (relativeStaticRoot !== 'apps/web/dist') {
        errors.push(
          `apps/api/src/main.ts: staticRoot resolves to ${relativeStaticRoot}, expected apps/web/dist`,
        );
      }
      const appDockerfile = readFileSync(
        resolve(contextRoot, 'Dockerfile'),
        'utf8',
      );
      if (
        !/^COPY\s+--from=build\s+(?:--chown=\S+\s+)?\/app\/apps\/web\/dist\s+\/app\/apps\/web\/dist\s*$/m.test(
          appDockerfile,
        )
      ) {
        errors.push(
          'Dockerfile: runtime image does not copy the built web dist to /app/apps/web/dist',
        );
      }
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `Docker path check passed: ${checkedCopies} build-context COPY source(s) exist; FROM digests are pinned${customDockerfile ? '' : '; API staticRoot matches the runtime web/dist path'}.`,
  );
}
