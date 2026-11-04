import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import {
  DEFAULT_EVENT_ID,
  DEFAULT_TENANT_ID,
  legacyEquipmentById,
  parseTenantManifest,
  type TenantManifest,
} from './domain/tenant-manifest.ts';
import { parseSlotSchedule, type Slot } from './domain/ticket.ts';

const environmentSchema = z
  .object({
    DATABASE_URL: z.string().refine((value) => {
      const protocol = URL.canParse(value) ? new URL(value).protocol : '';
      return protocol === 'postgres:' || protocol === 'postgresql:';
    }, 'must be a PostgreSQL connection URL'),
    ADMIN_TOKEN: z
      .string()
      .min(32, 'must be at least 32 characters')
      .refine((value) => !/\s/.test(value), 'must not contain whitespace'),
    AGENT_TOKEN: z
      .string()
      .min(32, 'must be at least 32 characters')
      .refine((value) => !/\s/.test(value), 'must not contain whitespace'),
    APP_MANIFEST_PATH: z.string().min(1).optional(),
    EVENT_END_AT: z.string().optional(),
    SLOT_SCHEDULE_JSON: z.string().min(1).optional(),
    TICKET_NUMBER_SCOPE: z.enum(['daily', 'event']).optional(),
  })
  .superRefine(({ ADMIN_TOKEN, AGENT_TOKEN }, context) => {
    if (ADMIN_TOKEN === AGENT_TOKEN) {
      context.addIssue({
        code: 'custom',
        path: ['AGENT_TOKEN'],
        message: 'must differ from ADMIN_TOKEN',
      });
    }
  });

export type AppConfig = {
  databaseUrl: string;
  adminToken: string;
  agentToken: string;
  eventEndAt: Date;
  numberScope: 'daily' | 'event';
  slotSchedule: readonly Slot[];
  tenantManifest?: TenantManifest;
};

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map(
        (issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`,
      )
      .join('; ');
    throw new Error(`Invalid application environment: ${details}`);
  }

  let eventEndAt: Date;
  let numberScope: 'daily' | 'event';
  let slotSchedule: readonly Slot[];
  let tenantManifest: TenantManifest | undefined;
  if (parsed.data.APP_MANIFEST_PATH !== undefined) {
    const manifestPath = resolve(parsed.data.APP_MANIFEST_PATH);
    const manifestText = readFileSync(manifestPath, 'utf8');
    let input: unknown;
    try {
      input = JSON.parse(manifestText);
    } catch {
      throw new Error('Invalid application manifest: JSON is malformed.');
    }
    const manifestResult = parseTenantManifest(input);
    if (!manifestResult.ok) {
      const details = manifestResult.error.issues
        .map(({ path, message }) => `${path}: ${message}`)
        .join('; ');
      throw new Error(`Invalid application manifest: ${details}`);
    }
    tenantManifest = manifestResult.value;
    const defaultTenant = tenantManifest.tenants.find(
      (tenant) => tenant.id === DEFAULT_TENANT_ID,
    );
    const defaultEvent = defaultTenant?.events.find(
      (event) => event.id === DEFAULT_EVENT_ID,
    );
    if (!defaultEvent) {
      throw new Error(
        'Invalid application manifest: fixed default event is missing.',
      );
    }
    if (
      defaultEvent.timeZone !== 'Asia/Tokyo' ||
      defaultEvent.equipment.length !==
        Object.keys(legacyEquipmentById).length ||
      defaultEvent.equipment.some(
        ({ id }) => legacyEquipmentById[id] === undefined,
      ) ||
      defaultEvent.schedule.some(
        ({ intervalMinutes, experienceMinutes, turnoverMinutes }) =>
          intervalMinutes !== 30 ||
          experienceMinutes !== 25 ||
          turnoverMinutes !== 5,
      )
    ) {
      throw new Error(
        'Invalid application manifest: fixed default event is not compatible with the legacy API.',
      );
    }
    const legacySchedule = parseSlotSchedule(
      JSON.stringify(
        defaultEvent.schedule.map(({ date, firstStart, lastStart }) => ({
          date,
          firstStart,
          lastStart,
        })),
      ),
    );
    if (!legacySchedule.ok) {
      throw new Error(
        'Invalid application manifest: fixed default event cannot be mapped to the legacy schedule.',
      );
    }
    const mappedEquipmentSchedule = legacySchedule.value.map((slot) => {
      const configuredEquipment = defaultEvent.equipment.find(
        ({ id }) => legacyEquipmentById[id] === slot.equipment,
      );
      if (!configuredEquipment) {
        throw new Error(
          'Invalid application manifest: fixed default equipment mapping is incomplete.',
        );
      }
      return {
        ...slot,
        equipment: legacyEquipmentById[configuredEquipment.id],
      };
    });
    eventEndAt = new Date(defaultEvent.endsAt);
    numberScope = defaultEvent.numberScope;
    slotSchedule = mappedEquipmentSchedule;

    if (
      parsed.data.EVENT_END_AT !== undefined &&
      Date.parse(parsed.data.EVENT_END_AT) !== eventEndAt.getTime()
    ) {
      throw new Error(
        'Invalid application environment: EVENT_END_AT differs from the manifest default event.',
      );
    }
    if (
      parsed.data.TICKET_NUMBER_SCOPE !== undefined &&
      parsed.data.TICKET_NUMBER_SCOPE !== numberScope
    ) {
      throw new Error(
        'Invalid application environment: TICKET_NUMBER_SCOPE differs from the manifest default event.',
      );
    }
    if (parsed.data.SLOT_SCHEDULE_JSON !== undefined) {
      const oldSchedule = parseSlotSchedule(parsed.data.SLOT_SCHEDULE_JSON);
      if (
        !oldSchedule.ok ||
        JSON.stringify(oldSchedule.value) !== JSON.stringify(slotSchedule)
      ) {
        throw new Error(
          'Invalid application environment: SLOT_SCHEDULE_JSON differs from the manifest default event.',
        );
      }
    }
  } else {
    if (
      parsed.data.EVENT_END_AT === undefined ||
      !/(?:Z|[+-]\d{2}:\d{2})$/i.test(parsed.data.EVENT_END_AT) ||
      !Number.isFinite(Date.parse(parsed.data.EVENT_END_AT))
    ) {
      throw new Error(
        'Invalid application environment: EVENT_END_AT must be an ISO 8601 timestamp with a timezone.',
      );
    }
    if (parsed.data.SLOT_SCHEDULE_JSON === undefined) {
      throw new Error(
        'Invalid application environment: SLOT_SCHEDULE_JSON is required without APP_MANIFEST_PATH.',
      );
    }
    const legacySchedule = parseSlotSchedule(parsed.data.SLOT_SCHEDULE_JSON);
    if (!legacySchedule.ok) {
      throw new Error(
        'Invalid application environment: SLOT_SCHEDULE_JSON is invalid.',
      );
    }
    eventEndAt = new Date(parsed.data.EVENT_END_AT);
    numberScope = parsed.data.TICKET_NUMBER_SCOPE ?? 'daily';
    slotSchedule = legacySchedule.value;
  }

  const lastSlotEndAt = Math.max(
    ...slotSchedule.map(
      ({ slotStartsAt }) => Date.parse(slotStartsAt) + 30 * 60_000,
    ),
  );
  if (eventEndAt.getTime() < lastSlotEndAt) {
    throw new Error(
      'Invalid application environment: EVENT_END_AT must be at or after the final slot end.',
    );
  }

  return {
    databaseUrl: parsed.data.DATABASE_URL,
    adminToken: parsed.data.ADMIN_TOKEN,
    agentToken: parsed.data.AGENT_TOKEN,
    eventEndAt,
    numberScope,
    slotSchedule,
    ...(tenantManifest === undefined ? {} : { tenantManifest }),
  };
}
