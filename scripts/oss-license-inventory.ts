import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

const root = process.cwd();
const reportPath = resolve(
  root,
  process.argv[2] ?? 'reports/oss-sbom.proposed.spdx.json',
);
const pnpmLockPath = join(root, 'pnpm-lock.yaml');
const goSumPath = join(root, 'apps/print-agent/go.sum');
const pnpmLock = await readFile(pnpmLockPath, 'utf8');
const goSum = await readFile(goSumPath, 'utf8');
const npmPackages = parsePnpmPackages(pnpmLock);
const goPackages = parseGoModules(goSum);
const [npmMetadata, goMetadata, containerMetadata, actionMetadata] =
  await Promise.all([
    readNpmMetadata(npmPackages),
    readGoMetadata(goPackages),
    readContainerMetadata(),
    readActionMetadata(),
  ]);
const allPackages = [
  ...npmMetadata,
  ...goMetadata,
  ...containerMetadata,
  ...actionMetadata,
].sort((left, right) =>
  `${left.ecosystem}/${left.name}@${left.version}`.localeCompare(
    `${right.ecosystem}/${right.name}@${right.version}`,
  ),
);
const unknownPackages = allPackages.filter(
  ({ declaredLicense }) => !isSpdxExpression(declaredLicense),
);
const lockDigest = createHash('sha256')
  .update(pnpmLock)
  .update('\0')
  .update(goSum)
  .digest('hex');
const report = {
  spdxVersion: 'SPDX-2.3',
  dataLicense: 'CC0-1.0',
  SPDXID: 'SPDXRef-DOCUMENT',
  name: 'queue-pilot provisional dependency inventory',
  documentNamespace: `https://example.invalid/spdx/queue-pilot/${lockDigest}`,
  creationInfo: {
    created: new Date().toISOString(),
    creators: ['Tool: scripts/oss-license-inventory.ts'],
  },
  documentDescribes: allPackages.map(({ SPDXID }) => SPDXID),
  packages: allPackages.map((entry) => ({
    SPDXID: entry.SPDXID,
    name: entry.name,
    versionInfo: entry.version,
    downloadLocation: 'NOASSERTION',
    filesAnalyzed: false,
    licenseConcluded: 'NOASSERTION',
    licenseDeclared: isSpdxExpression(entry.declaredLicense)
      ? entry.declaredLicense
      : 'NOASSERTION',
    licenseComments: entry.licenseEvidence,
    copyrightText: 'NOASSERTION',
    externalRefs: entry.purl
      ? [
          {
            referenceCategory: 'PACKAGE-MANAGER',
            referenceType: 'purl',
            referenceLocator: entry.purl,
          },
        ]
      : [],
  })),
  annotations: [
    {
      annotationDate: new Date().toISOString(),
      annotationType: 'OTHER',
      annotator: 'Tool: scripts/oss-license-inventory.ts',
      comment: `Provisional inventory only. ${unknownPackages.length} package(s) lack an SPDX license expression. Source notices and license compatibility require human review; this document does not grant distribution rights.`,
    },
  ],
};
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
  mode: 0o644,
});
console.log(
  `Provisional SBOM: ${relative(root, reportPath)}; packages=${allPackages.length}; license_unverified=${unknownPackages.length}; manual_review=required; publication_gate=FAIL`,
);
if (unknownPackages.length > 0) process.exitCode = 1;

function parsePnpmPackages(lock: string): Array<{
  name: string;
  version: string;
}> {
  const sections = Array.from(
    lock.matchAll(/^packages:\n([\s\S]*?)^snapshots:/gm),
    ([, section]) => section,
  ).filter((section): section is string => section !== undefined);
  if (sections.length === 0)
    throw new Error('Could not find a pnpm lockfile packages section.');
  const entries = sections.flatMap((section) =>
    Array.from(section.matchAll(/^ {2}(.+):$/gm), ([, rawLocator]) => {
      const locator = rawLocator?.replace(/^['"]|['"]$/g, '');
      if (!locator)
        throw new Error('The pnpm lockfile contains an empty locator.');
      const versionSeparator = locator.lastIndexOf('@');
      const rawVersion = locator.slice(versionSeparator + 1);
      const version = rawVersion.split(/[(_]/, 1)[0];
      const name = locator.slice(0, versionSeparator);
      if (!name || !version) {
        throw new Error(
          'The pnpm lockfile contains an invalid package locator.',
        );
      }
      return { name, version };
    }),
  );
  return [
    ...new Map(
      entries.map((entry) => [`${entry.name}@${entry.version}`, entry]),
    ).values(),
  ];
}

function parseGoModules(sum: string): Array<{ name: string; version: string }> {
  return [
    ...new Map(
      sum
        .split('\n')
        .filter(Boolean)
        .map((line) => line.trim().split(/\s+/))
        .filter(([, version]) => version !== undefined)
        .filter(([, version]) => !version.endsWith('/go.mod'))
        .map(([name, version]) => [
          `${name}@${version}`,
          { name: name ?? '', version: version ?? '' },
        ]),
    ).values(),
  ];
}

async function readNpmMetadata(
  packages: Array<{ name: string; version: string }>,
) {
  const storePath = join(root, 'node_modules/.pnpm');
  const installed = new Map<
    string,
    { declaredLicense: string | null; evidence: string | null }
  >();
  if (await exists(storePath)) {
    for (const storeEntry of await readdir(storePath, {
      withFileTypes: true,
    })) {
      if (!storeEntry.isDirectory()) continue;
      const dependencyRoot = join(storePath, storeEntry.name, 'node_modules');
      if (!(await exists(dependencyRoot))) continue;
      for (const entry of await readdir(dependencyRoot, {
        withFileTypes: true,
      })) {
        if (entry.name.startsWith('@') && entry.isDirectory()) {
          for (const scoped of await readdir(join(dependencyRoot, entry.name), {
            withFileTypes: true,
          })) {
            if (scoped.isDirectory()) {
              await addNpmManifest(
                join(dependencyRoot, entry.name, scoped.name, 'package.json'),
                installed,
              );
            }
          }
        } else if (entry.isDirectory()) {
          await addNpmManifest(
            join(dependencyRoot, entry.name, 'package.json'),
            installed,
          );
        }
      }
    }
  }
  return packages.map(({ name, version }, index) => {
    const metadata = installed.get(`${name}@${version}`);
    return {
      SPDXID: `SPDXRef-npm-${index + 1}`,
      ecosystem: 'npm',
      name,
      version,
      declaredLicense: metadata?.declaredLicense ?? null,
      licenseEvidence: metadata
        ? `package.json license=${metadata.declaredLicense ?? 'missing'}; ${metadata.evidence ?? 'no local license file found'}`
        : 'package is absent from the local pnpm store; license metadata not verified',
      purl: `pkg:npm/${name}@${version}`,
    };
  });
}

async function addNpmManifest(
  manifestPath: string,
  installed: Map<
    string,
    { declaredLicense: string | null; evidence: string | null }
  >,
): Promise<void> {
  if (!(await exists(manifestPath))) return;
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    name?: unknown;
    version?: unknown;
    license?: unknown;
    licenses?: unknown;
  };
  if (typeof manifest.name !== 'string' || typeof manifest.version !== 'string')
    return;
  const license =
    typeof manifest.license === 'string'
      ? manifest.license
      : typeof manifest.license === 'object' &&
          manifest.license !== null &&
          'type' in manifest.license &&
          typeof manifest.license.type === 'string'
        ? manifest.license.type
        : Array.isArray(manifest.licenses) &&
            typeof manifest.licenses[0] === 'object' &&
            manifest.licenses[0] !== null &&
            'type' in manifest.licenses[0] &&
            typeof manifest.licenses[0].type === 'string'
          ? manifest.licenses[0].type
          : null;
  const directory = manifestPath.slice(0, manifestPath.lastIndexOf('/'));
  const licenseFiles = (await readdir(directory)).filter((name) =>
    /^(license|licence|copying|notice)(\.|$)/i.test(name),
  );
  installed.set(`${manifest.name}@${manifest.version}`, {
    declaredLicense: license,
    evidence:
      licenseFiles.length === 0
        ? null
        : `local files: ${licenseFiles.join(', ')}`,
  });
}

async function readGoMetadata(
  packages: Array<{ name: string; version: string }>,
) {
  const cache = process.env.GOMODCACHE ?? getGoModuleCache();
  return Promise.all(
    packages.map(async ({ name, version }, index) => {
      const modulePath = join(
        cache,
        `${escapeGoPath(name)}@${escapeGoPath(version)}`,
      );
      const sourceAvailable = await exists(modulePath);
      const licenseFiles = sourceAvailable
        ? (await readdir(modulePath)).filter((entry) =>
            /^(license|licence|copying|notice)(\.|$)/i.test(entry),
          )
        : [];
      return {
        SPDXID: `SPDXRef-golang-${index + 1}`,
        ecosystem: 'golang',
        name,
        version,
        declaredLicense: null,
        licenseEvidence: sourceAvailable
          ? `module source present; candidate license files: ${licenseFiles.join(', ') || 'none'}; SPDX classification requires review`
          : 'module source is absent from the local Go module cache; license not verified',
        purl: `pkg:golang/${name}@${version}`,
      };
    }),
  );
}

async function readContainerMetadata() {
  const paths = [
    'Dockerfile',
    'Dockerfile.migrate',
    'apps/print-agent/Dockerfile',
    'compose.yaml',
    'deploy/examples/kubernetes/deployment.yaml',
    'deploy/examples/kubernetes/migration-job.yaml',
  ];
  const references = new Set<string>();
  for (const path of paths) {
    const source = await readFile(join(root, path), 'utf8');
    for (const [, reference] of source.matchAll(/^\s*FROM\s+([^\s]+)/gm))
      references.add(reference);
    for (const [, reference] of source.matchAll(/^\s*image:\s*([^\s#]+)/gm))
      references.add(reference);
  }
  const kustomize = await readFile(
    join(root, 'deploy/examples/kubernetes/kustomization.yaml'),
    'utf8',
  );
  for (const [, name, digest] of kustomize.matchAll(
    /^\s*newName:\s*([^\s]+)\n\s*digest:\s*([^\s#]+)/gm,
  )) {
    references.add(`${name}@${digest}`);
  }
  return [...references].sort().map((reference, index) => ({
    SPDXID: `SPDXRef-container-${index + 1}`,
    ecosystem: 'container',
    name: reference,
    version: reference,
    declaredLicense: null,
    licenseEvidence:
      'Image was not pulled and its layers were not inventoried; review the registry manifest, digest, and image contents.',
  }));
}

async function readActionMetadata() {
  const workflowRoot = join(root, '.github/workflows');
  const workflows = await readdir(workflowRoot, { withFileTypes: true });
  const references = new Map<string, string>();
  for (const workflow of workflows) {
    if (!workflow.isFile() || !/\.ya?ml$/.test(workflow.name)) continue;
    const path = join(workflowRoot, workflow.name);
    const source = await readFile(path, 'utf8');
    for (const [, reference] of source.matchAll(
      /^\s*uses:\s*['"]?([^\s'"]+)['"]?/gm,
    )) {
      if (reference?.startsWith('./')) continue;
      references.set(reference ?? '', path);
    }
  }
  return [...references.keys()].sort().map((reference, index) => ({
    SPDXID: `SPDXRef-action-${index + 1}`,
    ecosystem: 'github-action',
    name: reference.slice(0, reference.lastIndexOf('@')),
    version: reference.slice(reference.lastIndexOf('@') + 1),
    declaredLicense: null,
    licenseEvidence:
      'Workflow reference is pinned, but the action license and its transitive runtime dependencies require review.',
  }));
}

function getGoModuleCache(): string {
  const result = spawnSync('go', ['env', 'GOMODCACHE'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.status !== 0 || !result.stdout.trim()) return '';
  return result.stdout.trim();
}

function escapeGoPath(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `!${letter.toLowerCase()}`);
}

function isSpdxExpression(value: string | null): value is string {
  return (
    value !== null &&
    /^(?:[A-Za-z0-9.-]+|LicenseRef-[A-Za-z0-9.-]+)(?:\s+(?:AND|OR|WITH)\s+(?:[A-Za-z0-9.-]+|LicenseRef-[A-Za-z0-9.-]+))*$/.test(
      value,
    )
  );
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    )
      return false;
    throw error;
  }
}
