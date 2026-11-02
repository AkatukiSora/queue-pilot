import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const presentationRoot = fileURLToPath(
  new URL('../apps/api/src/presentation/', import.meta.url),
);
const applicationRoot = resolve(
  fileURLToPath(new URL('../apps/api/src/application/', import.meta.url)),
);
const files: string[] = [];

async function collect(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (entry.isFile() && path.endsWith('.ts')) files.push(path);
  }
}

await collect(presentationRoot);
const violations: string[] = [];
for (const file of files) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(
    /(?:from\s*|import\s*\()\s*['"]([^'"]+)['"]/g,
  )) {
    const specifier = match[1];
    if (specifier === undefined || !specifier.startsWith('.')) continue;
    const target = resolve(dirname(file), specifier);
    if (!target.startsWith(`${applicationRoot}${sep}`)) {
      violations.push(
        `${file}: presentation imports outside application: ${specifier}`,
      );
    }
  }
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `Layer check passed: ${files.length} presentation file(s) import only application modules.`,
  );
}
