import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Result } from './result.ts';
import { type ManifestEvent, parseManifestEvent } from './tenant-manifest.ts';

export type EventConfiguration = Omit<ManifestEvent, 'id' | 'slug'>;
export type InvalidEventConfiguration = {
  kind: 'InvalidEventConfiguration';
  issues: Array<{ path: string; message: string }>;
};

// The identity of an event (UUID and slug) is never part of its editable
// configuration, so the validator receives fixed placeholders for it.
const placeholderIdentity = {
  id: '00000000-0000-4000-8000-000000000000',
  slug: 'placeholder',
};

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const properties = Object.entries(value).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    return `{${properties.map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`).join(',')}}`;
  }
  const result = JSON.stringify(value);
  if (result === undefined) {
    throw new Error('Configuration contains an unserializable value.');
  }
  return result;
}

export function eventConfigurationRevision(config: unknown): string {
  return createHash('sha256').update(canonicalJson(config)).digest('hex');
}

export function parseEventConfiguration(
  input: Record<string, unknown>,
): Result<EventConfiguration, InvalidEventConfiguration> {
  if ('id' in input || 'slug' in input) {
    return {
      ok: false,
      error: {
        kind: 'InvalidEventConfiguration',
        issues: [
          {
            path: 'config',
            message: 'id and slug are not part of the event configuration',
          },
        ],
      },
    };
  }
  const parsed = parseManifestEvent({ ...placeholderIdentity, ...input });
  if (!parsed.ok) {
    return {
      ok: false,
      error: { kind: 'InvalidEventConfiguration', issues: parsed.error.issues },
    };
  }
  const { id: _id, slug: _slug, ...config } = parsed.value;
  return { ok: true, value: config };
}

const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(63);

export const configurationExportSchema = z
  .object({
    configurationExportVersion: z.literal(1),
    tenant: z
      .object({
        id: z.uuid(),
        slug: slugSchema,
        displayName: z.string().min(1),
        disabled: z.boolean(),
      })
      .strict(),
    members: z.array(
      z
        .object({
          issuer: z.string().url(),
          subject: z.string().min(1),
          role: z.enum(['admin', 'staff']),
          disabled: z.boolean(),
        })
        .strict(),
    ),
    events: z.array(
      z
        .object({
          id: z.uuid(),
          slug: slugSchema,
          config: z.record(z.string(), z.unknown()),
          configRevision: z.string().regex(/^[a-f0-9]{64}$/),
          disabled: z.boolean(),
          equipment: z.array(
            z
              .object({
                id: z.string().min(1),
                label: z.string().min(1),
                sortOrder: z.number().int().nonnegative(),
                disabled: z.boolean(),
              })
              .strict(),
          ),
          printers: z.array(
            z
              .object({
                id: z.uuid(),
                slug: slugSchema,
                label: z.string().min(1),
                kind: z.string().min(1),
                disabled: z.boolean(),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
  })
  .strict();

export type ConfigurationExport = z.infer<typeof configurationExportSchema>;
