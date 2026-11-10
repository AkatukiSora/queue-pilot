import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const repositoryRoot = new URL('../', import.meta.url);
const configPath = new URL('apps/api/src/config.ts', repositoryRoot);
const databaseConfigPath = new URL(
  'apps/api/src/database-config.ts',
  repositoryRoot,
);
const examplePath = new URL('.env.example', repositoryRoot);
const databaseComponentKeys = [
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'DB_SSLMODE',
  'DB_SSLROOTCERT',
];
const requiredDatabaseComponentKeys = [
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
];

function extractSchemaKeys(source, sourcePath, schemaName) {
  const sourceFile = ts.createSourceFile(
    sourcePath.pathname,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const declarations = sourceFile.statements.flatMap((statement) => {
    if (
      !ts.isVariableStatement(statement) ||
      (statement.declarationList.flags & ts.NodeFlags.Const) === 0
    ) {
      return [];
    }
    return statement.declarationList.declarations.filter(
      (declaration) =>
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === schemaName,
    );
  });
  if (declarations.length !== 1 || declarations[0].initializer === undefined) {
    throw new Error('Could not find the top-level environmentSchema const.');
  }

  let objectCall = declarations[0].initializer;
  while (
    ts.isCallExpression(objectCall) &&
    ts.isPropertyAccessExpression(objectCall.expression) &&
    objectCall.expression.name.text !== 'object'
  ) {
    if (objectCall.expression.name.text !== 'superRefine') {
      throw new Error(
        `Unsupported environmentSchema wrapper: ${objectCall.expression.name.text}.`,
      );
    }
    objectCall = objectCall.expression.expression;
  }
  if (
    !ts.isCallExpression(objectCall) ||
    !ts.isPropertyAccessExpression(objectCall.expression) ||
    !ts.isIdentifier(objectCall.expression.expression) ||
    objectCall.expression.expression.text !== 'z' ||
    objectCall.expression.name.text !== 'object' ||
    objectCall.arguments.length !== 1 ||
    !ts.isObjectLiteralExpression(objectCall.arguments[0])
  ) {
    throw new Error('Could not find the direct z.object schema in config.ts.');
  }

  const allowed = [];
  const required = [];
  for (const property of objectCall.arguments[0].properties) {
    if (
      !ts.isPropertyAssignment(property) ||
      (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name))
    ) {
      throw new Error(
        'Unsupported environmentSchema property; expected a direct property assignment.',
      );
    }

    const key = property.name.text;
    allowed.push(key);
    const isDirectlyOptional =
      ts.isCallExpression(property.initializer) &&
      ts.isPropertyAccessExpression(property.initializer.expression) &&
      property.initializer.expression.name.text === 'optional';
    if (isDirectlyOptional && property.initializer.arguments.length !== 0) {
      throw new Error(`Unsupported optional schema call for ${key}.`);
    }
    if (!isDirectlyOptional) required.push(key);
  }

  return { allowed, required };
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

function compareKeys(allowedKeys, requiredKeys, actualKeys) {
  const allowed = new Set(allowedKeys);
  const actual = new Set(actualKeys);
  return {
    missing: [...new Set(requiredKeys)]
      .filter((key) => !actual.has(key))
      .sort(),
    unexpected: [...actual].filter((key) => !allowed.has(key)).sort(),
    duplicates: [
      ...new Set(
        actualKeys
          .filter((key, index) => actualKeys.indexOf(key) !== index)
          .sort(),
      ),
    ],
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

function assertDatabaseMode(keys) {
  const actual = new Set(keys);
  const componentKeys = databaseComponentKeys.filter((key) => actual.has(key));
  if (actual.has('DATABASE_URL') && componentKeys.length > 0) {
    throw new Error('DATABASE_URL cannot be combined with DB_* settings.');
  }
  if (actual.has('DATABASE_URL')) return;

  const missing = requiredDatabaseComponentKeys.filter(
    (key) => !actual.has(key),
  );
  if (missing.length > 0) {
    throw new Error(
      `Define DATABASE_URL alone or all required DB_* settings; missing: ${missing.join(', ')}.`,
    );
  }
}

function runSelfTests() {
  const componentModeKeys = [
    ...requiredDatabaseComponentKeys,
    'DB_SSLMODE',
    'DB_SSLROOTCERT',
  ];
  assert.doesNotThrow(() => assertDatabaseMode(['DATABASE_URL']));
  assert.doesNotThrow(() => assertDatabaseMode(componentModeKeys));
  assert.throws(
    () => assertDatabaseMode(requiredDatabaseComponentKeys.slice(0, -1)),
    /DB_PASSWORD/,
  );
  assert.throws(
    () => assertDatabaseMode(['DATABASE_URL', 'DB_HOST']),
    /cannot be combined/,
  );
  assert.throws(() => assertDatabaseMode([]), /DATABASE_URL/);

  const fixture = `const environmentSchema = z.object({
  DATABASE_URL: z.string(),
  ADMIN_TOKEN: z.string().refine((value) => {
    const marker = '.optional()';
    // .optional() in a comment is not a schema wrapper.
    return value !== marker;
  }),
  AGENT_TOKEN: z.string().refine(
    (value) => value !== 'optional()',
    'optional() in a message is not a schema wrapper',
  ),
  OPTIONAL_SINGLE_LINE: z.string().optional(),
  OPTIONAL_MULTILINE:
    z.string()
      .min(1)
      .optional(),
}).superRefine((_value, context) => {
  context.addIssue({ message: '.optional()' });
});`;
  const schema = extractSchemaKeys(fixture, configPath, 'environmentSchema');
  assert.deepEqual(schema, {
    allowed: [
      'DATABASE_URL',
      'ADMIN_TOKEN',
      'AGENT_TOKEN',
      'OPTIONAL_SINGLE_LINE',
      'OPTIONAL_MULTILINE',
    ],
    required: ['DATABASE_URL', 'ADMIN_TOKEN', 'AGENT_TOKEN'],
  });

  const validExample = [
    'DATABASE_URL=postgres://example',
    '# comment',
    '',
    'ADMIN_TOKEN=example',
    'AGENT_TOKEN=example',
  ].join('\r\n');
  const requiredKeys = extractExampleKeys(validExample);
  assert.doesNotThrow(() =>
    assertNoDifferences(
      compareKeys(schema.allowed, schema.required, requiredKeys),
    ),
  );
  assert.doesNotThrow(() =>
    assertNoDifferences(
      compareKeys(schema.allowed, schema.required, [
        ...requiredKeys,
        'OPTIONAL_SINGLE_LINE',
        'OPTIONAL_MULTILINE',
      ]),
    ),
  );

  for (const key of schema.required) {
    assert.throws(
      () =>
        assertNoDifferences(
          compareKeys(
            schema.allowed,
            schema.required,
            requiredKeys.filter((actualKey) => actualKey !== key),
          ),
        ),
      new RegExp(`missing: ${key}`),
    );
  }
  assert.throws(
    () =>
      assertNoDifferences(
        compareKeys(schema.allowed, schema.required, [
          ...requiredKeys,
          'UNKNOWN_KEY',
        ]),
      ),
    /unexpected: UNKNOWN_KEY/,
  );
  for (const key of [schema.required[0], 'OPTIONAL_SINGLE_LINE']) {
    const duplicateKeys = [...requiredKeys, key];
    if (!requiredKeys.includes(key)) duplicateKeys.push(key);
    assert.throws(
      () =>
        assertNoDifferences(
          compareKeys(schema.allowed, schema.required, duplicateKeys),
        ),
      new RegExp(`duplicates: ${key}`),
    );
  }
  assert.throws(
    () => extractExampleKeys(`${validExample}\r\nnot-an-environment-entry`),
    /Invalid \.env\.example entry on line 6\./,
  );
  console.log('Environment checker self-tests passed.');
}

const [configSource, databaseConfigSource, example] = await Promise.all([
  readFile(configPath, 'utf8'),
  readFile(databaseConfigPath, 'utf8'),
  readFile(examplePath, 'utf8'),
]);
const configSchema = extractSchemaKeys(
  configSource,
  configPath,
  'environmentSchema',
);
const databaseSchema = extractSchemaKeys(
  databaseConfigSource,
  databaseConfigPath,
  'databaseEnvironmentSchema',
);
const allowedKeys = [...configSchema.allowed, ...databaseSchema.allowed];
const requiredKeys = [...configSchema.required, ...databaseSchema.required];
const exampleKeys = extractExampleKeys(example);
assertNoDifferences(compareKeys(allowedKeys, requiredKeys, exampleKeys));
assertDatabaseMode(exampleKeys);

if (process.argv.slice(2).includes('--self-test')) runSelfTests();

console.log(
  `Environment example matches ${allowedKeys.length} allowed keys; database mode is valid.`,
);
