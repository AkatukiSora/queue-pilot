import { databaseUrl, migrationDirectory, runAtlas } from './atlas.mjs';

await runAtlas([
  'migrate',
  'apply',
  '--url',
  databaseUrl(),
  '--dir',
  migrationDirectory,
]);
