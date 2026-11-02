import { runAtlas } from './atlas.mjs';
import { withTemporaryPostgres } from './embedded-postgres.mjs';

const name = process.argv[2];
if (process.argv.length !== 3 || !/^[a-z][a-z0-9_]*$/.test(name ?? '')) {
  throw new Error('使用法: pnpm db:diff <migration_name>');
}

await withTemporaryPostgres(async ({ postgres, urlFor }) => {
  await postgres.createDatabase('atlasdev');
  await runAtlas(['migrate', 'diff', name, '--env', 'local'], {
    ...process.env,
    ATLAS_DEV_URL: urlFor('atlasdev'),
  });
});
