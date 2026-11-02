import { databaseUrl, migrationDirectory, runAtlas } from './atlas.mjs';

await runAtlas([
  'migrate',
  'status',
  '--url',
  databaseUrl(),
  '--dir',
  migrationDirectory,
]);
