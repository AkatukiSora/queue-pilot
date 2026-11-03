import { readFile } from 'node:fs/promises';

const repositoryRoot = new URL('../', import.meta.url);
const configPath = new URL('apps/api/src/config.ts', repositoryRoot);
const examplePath = new URL('.env.example', repositoryRoot);

function extractSchemaKeys(source) {
  const schemaStart = source.indexOf('const environmentSchema =');
  const objectMarker = source.indexOf('.object(', schemaStart);
  const openBrace = source.indexOf('{', objectMarker);
  if (schemaStart < 0 || objectMarker < 0 || openBrace < 0) {
    throw new Error('Could not find the environment Zod object in config.ts.');
  }

  let depth = 0;
  let closeBrace = -1;
  for (let index = openBrace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) {
      closeBrace = index;
      break;
    }
  }
  if (closeBrace < 0) {
    throw new Error('Could not find the end of the environment Zod object.');
  }

  return [
    ...source
      .slice(openBrace + 1, closeBrace)
      .matchAll(/^ {4}([A-Z][A-Z0-9_]*)\s*:/gm),
  ].map((match) => match[1]);
}

function extractExampleKeys(source) {
  const keys = [];
  for (const [index, rawLine] of source.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const match = /^([A-Z][A-Z0-9_]*)=/.exec(line);
    if (!match) {
      throw new Error(`Invalid .env.example entry on line ${index + 1}.`);
    }
    keys.push(match[1]);
  }
  return keys;
}

function compareKeys(expectedKeys, actualKeys) {
  const expected = new Set(expectedKeys);
  const actual = new Set(actualKeys);
  return {
    missing: [...expected].filter((key) => !actual.has(key)).sort(),
    unexpected: [...actual].filter((key) => !expected.has(key)).sort(),
    duplicates: actualKeys
      .filter((key, index) => actualKeys.indexOf(key) !== index)
      .sort(),
  };
}

function assertNoDifferences(result) {
  const issues = [];
  if (result.missing.length > 0)
    issues.push(`missing: ${result.missing.join(', ')}`);
  if (result.unexpected.length > 0)
    issues.push(`unexpected: ${result.unexpected.join(', ')}`);
  if (result.duplicates.length > 0)
    issues.push(`duplicates: ${result.duplicates.join(', ')}`);
  if (issues.length > 0) throw new Error(issues.join('; '));
}

const config = await readFile(configPath, 'utf8');
const example = await readFile(examplePath, 'utf8');
const schemaKeys = extractSchemaKeys(config);
const exampleKeys = extractExampleKeys(example);
assertNoDifferences(compareKeys(schemaKeys, exampleKeys));

if (process.argv.slice(2).includes('--self-test')) {
  const negativeCase = compareKeys(schemaKeys, [
    ...exampleKeys,
    'CHECKER_NEGATIVE_TEST',
  ]);
  if (!negativeCase.unexpected.includes('CHECKER_NEGATIVE_TEST')) {
    throw new Error(
      'Negative-case self-test did not reject an unexpected key.',
    );
  }
  console.log('Negative-case self-test passed.');
}

console.log(
  `Environment example keys match the Zod schema (${schemaKeys.length} keys).`,
);
