import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { chmod, chown, mkdir, writeFile } from 'node:fs/promises';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
const tokenPath = process.env.AGENT_TOKEN_PATH;
const previewPath = process.env.PREVIEW_OUTPUT_PATH;
if (!databaseUrl || !tokenPath || !previewPath) {
  throw new Error('Local preview-agent bootstrap configuration is incomplete.');
}

const tenantId = '00000000-0000-4000-8000-000000000001';
const eventId = '00000000-0000-4000-8000-000000000002';
const pool = new Pool({ connectionString: databaseUrl, max: 1 });
try {
  const printer = await pool.query<{ id: string }>(
    'SELECT id::text FROM printers WHERE tenant_id = $1 AND event_id = $2 AND slug = $3 AND disabled_at IS NULL',
    [tenantId, eventId, 'json-preview'],
  );
  const printerId = printer.rows[0]?.id;
  if (!printerId) throw new Error('The local preview printer was not created.');

  const agentId = randomUUID();
  const token = randomBytes(32).toString('base64url');
  await pool.query(
    'INSERT INTO agents (id, tenant_id, event_id, printer_id) VALUES ($1, $2, $3, $4)',
    [agentId, tenantId, eventId, printerId],
  );
  await pool.query(
    "INSERT INTO agent_credentials (id, secret_hash, agent_id, tenant_id, event_id, printer_id, created_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6, now(), now() + interval '90 days')",
    [
      randomUUID(),
      createHash('sha256').update(token).digest('hex'),
      agentId,
      tenantId,
      eventId,
      printerId,
    ],
  );

  const ticketId = randomUUID();
  const publicToken = randomBytes(16).toString('base64url');
  const idempotencyKey = randomUUID();
  const issuedAt = new Date();
  const slotStartsAt = new Date('2099-01-01T01:00:00.000Z');
  await pool.query(
    'INSERT INTO ticket_counters (counter_key, last_number, tenant_id, event_id) VALUES ($1, 1, $2, $3)',
    ['2099-01-01', tenantId, eventId],
  );
  await pool.query(
    `INSERT INTO tickets (
       id, tenant_id, event_id, counter_key, number, party_size, public_token,
       idempotency_key, request_hash, status, slot_starts_at, equipment,
       equipment_id, issued_at, updated_at
     ) VALUES ($1, $2, $3, '2099-01-01', 1, 1, $4, $5, $6, 'waiting', $7,
               'Equipment A', 'quest-3', $8, $8)`,
    [
      ticketId,
      tenantId,
      eventId,
      publicToken,
      idempotencyKey,
      createHash('sha256').update(idempotencyKey).digest('hex'),
      slotStartsAt,
      issuedAt,
    ],
  );
  await pool.query(
    'INSERT INTO public_ticket_locator (token, tenant_id, event_id, ticket_id) VALUES ($1, $2, $3, $4)',
    [publicToken, tenantId, eventId, ticketId],
  );
  await pool.query(
    `INSERT INTO print_jobs (
       id, tenant_id, event_id, printer_id, payload_version, ticket_id,
       status, created_at, updated_at, attempt, payload
     ) VALUES ($1, $2, $3, $4, 2, $5, 'queued', $6, $6, 0, $7::jsonb)`,
    [
      randomUUID(),
      tenantId,
      eventId,
      printerId,
      ticketId,
      issuedAt,
      JSON.stringify({
        schemaVersion: 2,
        ticketNumber: 1,
        reservation: { kind: 'slot', startsAt: slotStartsAt.toISOString() },
        issuedAt: issuedAt.toISOString(),
        timeZone: 'Asia/Tokyo',
        publicURL: `http://localhost:8787/ticket/${publicToken}`,
        copy: {
          receiptTitle: 'Sample ticket',
          arrivalGuidance: 'Arrive at the sample entrance.',
        },
      }),
    ],
  );

  const tokenDirectory = tokenPath.slice(0, tokenPath.lastIndexOf('/'));
  await mkdir(tokenDirectory, { recursive: true });
  await writeFile(tokenPath, token, { flag: 'wx', mode: 0o444 });
  await writeFile(`${tokenDirectory}/printer-id`, printerId, {
    flag: 'wx',
    mode: 0o444,
  });
  await chmod(tokenPath, 0o444);
  await chmod(`${tokenDirectory}/printer-id`, 0o444);
  await mkdir(previewPath, { recursive: true });
  await chmod(previewPath, 0o770);
  await chown(previewPath, 65532, 65532);
  console.log(
    'Created a local sample ticket and isolated JSON-preview agent; credentials were not displayed.',
  );
} finally {
  await pool.end();
}
