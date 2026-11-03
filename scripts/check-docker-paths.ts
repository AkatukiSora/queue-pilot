import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
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
const appBuildCopySources = [];
let appBuildStageFound = false;
for (const dockerfile of dockerfiles) {
  const dockerfilePath = resolve(contextRoot, dockerfile);
  if (!existsSync(dockerfilePath)) {
    errors.push(`${dockerfile}: Dockerfile does not exist`);
    continue;
  }

  const content = readFileSync(dockerfilePath, 'utf8');
  let currentStage = null;
  for (const [lineIndex, rawLine] of content.split('\n').entries()) {
    const line = rawLine.trim();
    const from = line.match(/^FROM\s+(\S+)(?:\s+AS\s+(\S+))?$/i);
    if (from) {
      currentStage = from[2]?.toLowerCase() ?? null;
      if (dockerfile === 'Dockerfile' && currentStage === 'build') {
        appBuildStageFound = true;
      }
    }
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
      if (dockerfile === 'Dockerfile' && currentStage === 'build') {
        appBuildCopySources.push(sourcePath);
      }
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
  if (!appBuildStageFound) {
    errors.push('Dockerfile: build stage was not found');
  }

  const appsRoot = resolve(contextRoot, 'apps');
  if (!existsSync(appsRoot)) {
    errors.push('apps: application directory does not exist');
  } else {
    for (const application of readdirSync(appsRoot, { withFileTypes: true })) {
      if (!application.isDirectory()) continue;
      const applicationRoot = resolve(appsRoot, application.name);
      for (const filename of readdirSync(applicationRoot)) {
        if (!/^tsconfig.*\.json$/i.test(filename)) continue;
        const tsconfigPath = resolve(applicationRoot, filename);
        const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'));
        const extendsTargets =
          tsconfig.extends === undefined
            ? []
            : Array.isArray(tsconfig.extends)
              ? tsconfig.extends
              : [tsconfig.extends];

        for (const target of extendsTargets) {
          if (typeof target !== 'string') {
            errors.push(`${tsconfigPath}: extends entries must be strings`);
            continue;
          }
          if (!target.startsWith('.')) continue;

          let resolvedTarget = resolve(dirname(tsconfigPath), target);
          if (
            !existsSync(resolvedTarget) &&
            !resolvedTarget.endsWith('.json') &&
            existsSync(`${resolvedTarget}.json`)
          ) {
            resolvedTarget = `${resolvedTarget}.json`;
          }
          if (!existsSync(resolvedTarget)) {
            errors.push(
              `${tsconfigPath}: extends target does not exist: ${target}`,
            );
            continue;
          }

          const copied = appBuildCopySources.some((sourcePath) => {
            if (!existsSync(sourcePath)) return false;
            const relativeTarget = relative(sourcePath, resolvedTarget);
            return (
              relativeTarget === '' ||
              (statSync(sourcePath).isDirectory() &&
                !isAbsolute(relativeTarget) &&
                relativeTarget !== '..' &&
                !relativeTarget.startsWith(`..${sep}`))
            );
          });
          if (!copied) {
            errors.push(
              `${tsconfigPath}: extends target is not copied into the Docker build stage: ${target}`,
            );
          }
        }
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
    `Docker path check passed: ${checkedCopies} build-context COPY source(s) exist; FROM digests are pinned${customDockerfile ? '' : '; app tsconfig extends targets are copied; API staticRoot matches the runtime web/dist path'}.`,
  );
}
