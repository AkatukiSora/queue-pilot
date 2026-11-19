import { spawnSync } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = join(root, 'apps/web/src/generated/credits.json');
const goLicenseTemplate = join(root, 'scripts/go-credits.tmpl');
const goLicenseModule = 'github.com/google/go-licenses/v2';
const goLicenseVersion = 'v2.0.1';

export const ALLOWED_LICENSES = new Set([
  '0BSD',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'BSL-1.0',
  'BlueOak-1.0.0',
  'CC0-1.0',
  'ISC',
  'MIT',
  'MIT-0',
  'Python-2.0',
  'Unlicense',
  'Zlib',
]);

export function assertAllowedLicense(license, dependency) {
  if (typeof license !== 'string' || license.length === 0) {
    throw new Error(`${dependency}: unknown license`);
  }
  if (!ALLOWED_LICENSES.has(license)) {
    throw new Error(`${dependency}: license ${license} is not allowlisted`);
  }
  return license;
}

async function generateCredits() {
  const webOutput = run(
    'pnpm',
    ['--dir', 'apps/web', 'licenses', 'list', '--prod', '--json'],
    root,
  );
  const groupedWebPackages = JSON.parse(webOutput);
  const webCredits = [];
  for (const packages of Object.values(groupedWebPackages)) {
    if (!Array.isArray(packages)) {
      throw new Error('pnpm licenses returned an invalid package group.');
    }
    for (const entry of packages) {
      if (
        typeof entry.name !== 'string' ||
        !Array.isArray(entry.versions) ||
        !Array.isArray(entry.paths) ||
        entry.versions.length !== entry.paths.length
      ) {
        throw new Error('pnpm licenses returned an incomplete package entry.');
      }
      for (const [index, version] of entry.versions.entries()) {
        const dependency = `${entry.name}@${version}`;
        const license = assertAllowedLicense(entry.license, dependency);
        const packagePath = entry.paths[index];
        const manifest = JSON.parse(
          await readFile(join(packagePath, 'package.json'), 'utf8'),
        );
        if (manifest.name !== entry.name || manifest.version !== version) {
          throw new Error(
            `${dependency}: installed package metadata mismatch.`,
          );
        }
        const documents = await readLicenseDocuments(packagePath, license);
        const repository = repositoryUrl(manifest.repository);
        const homepage = httpsUrl(manifest.homepage ?? entry.homepage);
        if (!repository && !homepage) {
          throw new Error(`${dependency}: source link is missing.`);
        }
        webCredits.push({
          name: entry.name,
          version,
          license,
          repository,
          homepage,
          licenseFile: documents.licenseFile,
          licenseText: documents.licenseText,
          notices: documents.notices,
        });
      }
    }
  }
  if (webCredits.length === 0) {
    throw new Error(
      'pnpm licenses returned no production dependencies for apps/web.',
    );
  }

  const goMod = await readFile(join(root, 'apps/print-agent/go.mod'), 'utf8');
  const mainModule = goMod.match(/^module\s+(\S+)/m)?.[1];
  if (!mainModule)
    throw new Error('Could not read the print-agent module path.');
  const goDirectory = join(root, 'apps/print-agent');
  run('go', ['install', `${goLicenseModule}@${goLicenseVersion}`], goDirectory);
  const goPath = run('go', ['env', 'GOPATH'], goDirectory).trim();
  const goBin = process.env.GOBIN || join(goPath.split(delimiter)[0], 'bin');
  const goLicenseExecutable = join(
    goBin,
    process.platform === 'win32' ? 'go-licenses.exe' : 'go-licenses',
  );
  const goCreditsByKey = new Map();
  for (const [goos, goarch] of [
    ['linux', 'amd64'],
    ['linux', 'arm64'],
  ]) {
    const report = run(
      goLicenseExecutable,
      [
        'report',
        '--ignore',
        mainModule,
        './...',
        `--template=${goLicenseTemplate}`,
      ],
      join(root, 'apps/print-agent'),
      { ...process.env, GOOS: goos, GOARCH: goarch },
    );
    for (const line of report.split('\n').filter(Boolean)) {
      const entry = JSON.parse(line);
      if (typeof entry.name !== 'string' || typeof entry.version !== 'string') {
        throw new Error('go-licenses returned an incomplete package entry.');
      }
      const dependency = `${entry.name}@${entry.version}`;
      const license = assertAllowedLicense(entry.license, dependency);
      if (typeof entry.licenseText !== 'string' || !entry.licenseText.trim()) {
        throw new Error(`${dependency}: license text is missing.`);
      }
      if (typeof entry.licensePath !== 'string' || !entry.licensePath) {
        throw new Error(`${dependency}: license file path is missing.`);
      }
      const licenseUrl = httpsUrl(entry.licenseUrl);
      if (!licenseUrl) {
        throw new Error(`${dependency}: license source URL is missing.`);
      }
      const credit = {
        name: entry.name,
        version: entry.version,
        license,
        repository: repositoryFromLicenseUrl(licenseUrl),
        homepage: `https://pkg.go.dev/${entry.name
          .split('/')
          .map(encodeURIComponent)
          .join('/')}@${encodeURIComponent(entry.version)}`,
        licenseUrl,
        licenseFile: basename(entry.licensePath),
        licenseText: entry.licenseText,
        notices: await readNoticeFiles(dirname(entry.licensePath)),
      };
      const key = `${credit.name}@${credit.version}`;
      const previous = goCreditsByKey.get(key);
      if (previous && JSON.stringify(previous) !== JSON.stringify(credit)) {
        throw new Error(
          `${dependency}: license metadata differs by target platform.`,
        );
      }
      goCreditsByKey.set(key, credit);
    }
  }
  if (goCreditsByKey.size === 0) {
    throw new Error('go-licenses returned no print-agent dependencies.');
  }

  const credits = {
    web: sortCredits(webCredits),
    printAgent: sortCredits([...goCreditsByKey.values()]),
  };
  const content = `${JSON.stringify(credits, null, 2)}\n`;
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, content);
  console.log(
    `Generated ${outputPath}: web=${credits.web.length}, print-agent=${credits.printAgent.length}, bytes=${Buffer.byteLength(content)}`,
  );
}

async function readLicenseDocuments(packagePath, license) {
  const files = await readdir(packagePath);
  const licenseFiles = files
    .filter((file) =>
      /^(?:UNLICENSE|LICENSE|LICENCE|COPYING)(?:[._-].*)?$/i.test(file),
    )
    .sort();
  const preferred = licenseFiles.find((file) =>
    /^(?:UNLICENSE|LICENSE|LICENCE|COPYING)(?:\.(?:md|txt|rst))?$/i.test(file),
  );
  const selected =
    preferred ??
    licenseFiles.find((file) =>
      file.toLowerCase().includes(license.toLowerCase()),
    ) ??
    licenseFiles[0];
  if (!selected) {
    throw new Error(`${packagePath}: full text for ${license} is missing.`);
  }
  const licenseText = (
    await readFile(join(packagePath, selected), 'utf8')
  ).replace(/\r\n/g, '\n');
  if (!licenseText.trim()) {
    throw new Error(`${packagePath}/${selected}: license text is empty.`);
  }
  const notices = await readNoticeFiles(packagePath);
  return { licenseFile: selected, licenseText, notices };
}

async function readNoticeFiles(directory) {
  const notices = [];
  for (const file of (await readdir(directory))
    .filter((name) => /^(?:NOTICE|COPYRIGHT)(?:[._-].*)?$/i.test(name))
    .sort()) {
    notices.push({
      file,
      text: (await readFile(join(directory, file), 'utf8')).replace(
        /\r\n/g,
        '\n',
      ),
    });
  }
  return notices;
}

function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed (${result.status}):\n${result.stderr}`,
    );
  }
  return result.stdout;
}

function repositoryUrl(repository) {
  const raw = typeof repository === 'string' ? repository : repository?.url;
  if (typeof raw !== 'string') return null;
  const normalized = raw
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/\.git$/, '');
  return httpsUrl(normalized);
}

function httpsUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function repositoryFromLicenseUrl(value) {
  if (!value.startsWith('https://github.com/')) return null;
  return value.replace(/\/blob\/[^/]+\/.+$/, '');
}

function sortCredits(credits) {
  return credits.sort((left, right) => {
    const leftKey = `${left.name}@${left.version}`;
    const rightKey = `${right.name}@${right.version}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  await generateCredits();
}
