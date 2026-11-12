import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { LegacyEventSettings } from './application/event-request-settings.ts';
import { loadDatabaseUrl } from './database-config.ts';
import {
  DEFAULT_EVENT_ID,
  DEFAULT_TENANT_ID,
  type LegacyEventBaseline,
  legacyEquipmentById,
  parseTenantManifest,
  type TenantManifest,
} from './domain/tenant-manifest.ts';
import { parseSlotSchedule, type Slot } from './domain/ticket.ts';

const environmentSchema = z
  .object({
    ADMIN_TOKEN: z
      .string()
      .min(32, 'must be at least 32 characters')
      .refine((value) => !/\s/.test(value), 'must not contain whitespace')
      .optional(),
    AGENT_TOKEN: z
      .string()
      .min(32, 'must be at least 32 characters')
      .refine((value) => !/\s/.test(value), 'must not contain whitespace')
      .optional(),
    APP_MANIFEST_PATH: z.string().min(1).optional(),
    EVENT_END_AT: z.string().optional(),
    SLOT_SCHEDULE_JSON: z.string().min(1).optional(),
    TICKET_NUMBER_SCOPE: z.enum(['daily', 'event']).optional(),
    AUTH_MODE: z.enum(['legacy-single', 'oidc/shared']).optional(),
    AUTH_PROVIDER: z.enum(['github', 'oidc']).optional(),
    AUTH_SECRET: z.string().min(32).optional(),
    PUBLIC_BASE_URL: z.string().url().optional(),
    GITHUB_CLIENT_ID: z.string().min(1).optional(),
    GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
    OIDC_ISSUER: z.string().url().optional(),
    OIDC_DISCOVERY_URL: z.string().url().optional(),
    OIDC_CLIENT_ID: z.string().min(1).optional(),
    OIDC_CLIENT_SECRET: z.string().min(1).optional(),
  })
  .superRefine(
    (
      {
        ADMIN_TOKEN,
        AGENT_TOKEN,
        AUTH_MODE,
        AUTH_PROVIDER,
        AUTH_SECRET,
        PUBLIC_BASE_URL,
        GITHUB_CLIENT_ID,
        GITHUB_CLIENT_SECRET,
        OIDC_ISSUER,
        OIDC_DISCOVERY_URL,
        OIDC_CLIENT_ID,
        OIDC_CLIENT_SECRET,
      },
      context,
    ) => {
      const mode = AUTH_MODE ?? 'legacy-single';
      if (mode === 'legacy-single') {
        for (const [name, value] of [
          ['ADMIN_TOKEN', ADMIN_TOKEN],
          ['AGENT_TOKEN', AGENT_TOKEN],
        ] as const) {
          if (value === undefined) {
            context.addIssue({
              code: 'custom',
              path: [name],
              message: 'is required when AUTH_MODE=legacy-single',
            });
          }
        }
      }
      if (
        ADMIN_TOKEN !== undefined &&
        AGENT_TOKEN !== undefined &&
        ADMIN_TOKEN === AGENT_TOKEN
      ) {
        context.addIssue({
          code: 'custom',
          path: ['AGENT_TOKEN'],
          message: 'must differ from ADMIN_TOKEN',
        });
      }
      if (mode !== 'oidc/shared') return;

      for (const [name, value] of [
        ['AUTH_PROVIDER', AUTH_PROVIDER],
        ['AUTH_SECRET', AUTH_SECRET],
        ['PUBLIC_BASE_URL', PUBLIC_BASE_URL],
      ] as const) {
        if (value === undefined) {
          context.addIssue({
            code: 'custom',
            path: [name],
            message: 'is required when AUTH_MODE=oidc/shared',
          });
        }
      }
      if (ADMIN_TOKEN !== undefined || AGENT_TOKEN !== undefined) {
        context.addIssue({
          code: 'custom',
          path: ['ADMIN_TOKEN', 'AGENT_TOKEN'],
          message: 'legacy bearer tokens are not accepted in shared mode',
        });
      }
      if (PUBLIC_BASE_URL !== undefined) {
        const url = new URL(PUBLIC_BASE_URL);
        const local = ['localhost', '127.0.0.1', '[::1]'].includes(
          url.hostname,
        );
        if (
          (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
          url.pathname !== '/' ||
          url.search !== '' ||
          url.hash !== ''
        ) {
          context.addIssue({
            code: 'custom',
            path: ['PUBLIC_BASE_URL'],
            message:
              'must be an HTTPS origin (HTTP localhost is allowed for development)',
          });
        }
      }
      if (AUTH_PROVIDER === 'github') {
        for (const [name, value] of [
          ['GITHUB_CLIENT_ID', GITHUB_CLIENT_ID],
          ['GITHUB_CLIENT_SECRET', GITHUB_CLIENT_SECRET],
        ] as const) {
          if (value === undefined) {
            context.addIssue({
              code: 'custom',
              path: [name],
              message: 'is required when AUTH_PROVIDER=github',
            });
          }
        }
        if (
          OIDC_ISSUER !== undefined ||
          OIDC_DISCOVERY_URL !== undefined ||
          OIDC_CLIENT_ID !== undefined ||
          OIDC_CLIENT_SECRET !== undefined
        ) {
          context.addIssue({
            code: 'custom',
            path: ['OIDC_ISSUER'],
            message: 'OIDC settings must not be set when AUTH_PROVIDER=github',
          });
        }
      }
      if (AUTH_PROVIDER === 'oidc') {
        for (const [name, value] of [
          ['OIDC_ISSUER', OIDC_ISSUER],
          ['OIDC_DISCOVERY_URL', OIDC_DISCOVERY_URL],
          ['OIDC_CLIENT_ID', OIDC_CLIENT_ID],
          ['OIDC_CLIENT_SECRET', OIDC_CLIENT_SECRET],
        ] as const) {
          if (value === undefined) {
            context.addIssue({
              code: 'custom',
              path: [name],
              message: 'is required when AUTH_PROVIDER=oidc',
            });
          }
        }
        if (
          GITHUB_CLIENT_ID !== undefined ||
          GITHUB_CLIENT_SECRET !== undefined
        ) {
          context.addIssue({
            code: 'custom',
            path: ['GITHUB_CLIENT_ID'],
            message: 'GitHub settings must not be set when AUTH_PROVIDER=oidc',
          });
        }
        for (const [name, value] of [
          ['OIDC_ISSUER', OIDC_ISSUER],
          ['OIDC_DISCOVERY_URL', OIDC_DISCOVERY_URL],
        ] as const) {
          if (value !== undefined) {
            const url = new URL(value);
            const local = ['localhost', '127.0.0.1', '[::1]'].includes(
              url.hostname,
            );
            if (
              url.protocol !== 'https:' &&
              !(local && url.protocol === 'http:')
            ) {
              context.addIssue({
                code: 'custom',
                path: [name],
                message: 'must use HTTPS except for localhost development',
              });
            }
          }
        }
      }
    },
  );

export type SharedAuthConfig = {
  baseURL: string;
  secret: string;
  provider:
    | { kind: 'github'; clientId: string; clientSecret: string }
    | {
        kind: 'oidc';
        issuer: string;
        discoveryURL: string;
        clientId: string;
        clientSecret: string;
      };
};

type AppConfigCommon = {
  databaseUrl: string;
  legacyEventBaseline?: LegacyEventBaseline;
  tenantManifest?: TenantManifest;
};

export type AppConfig = AppConfigCommon &
  (
    | {
        authMode: 'legacy-single';
        adminToken: string;
        agentToken: string;
        legacyEventSettings: LegacyEventSettings;
        sharedAuth?: never;
      }
    | {
        authMode: 'oidc/shared';
        sharedAuth: SharedAuthConfig;
        tenantManifest: TenantManifest;
        adminToken?: never;
        agentToken?: never;
        legacyEventSettings?: never;
      }
  );

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const databaseUrl = loadDatabaseUrl(environment);
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map(
        (issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`,
      )
      .join('; ');
    throw new Error(`Invalid application environment: ${details}`);
  }
  const authMode = parsed.data.AUTH_MODE ?? 'legacy-single';
  if (
    authMode === 'oidc/shared' &&
    parsed.data.APP_MANIFEST_PATH === undefined
  ) {
    throw new Error(
      'Invalid application environment: APP_MANIFEST_PATH is required when AUTH_MODE=oidc/shared.',
    );
  }
  const sharedAuth: SharedAuthConfig | undefined =
    authMode !== 'oidc/shared'
      ? undefined
      : parsed.data.AUTH_PROVIDER === 'github'
        ? {
            baseURL: parsed.data.PUBLIC_BASE_URL!,
            secret: parsed.data.AUTH_SECRET!,
            provider: {
              kind: 'github',
              clientId: parsed.data.GITHUB_CLIENT_ID!,
              clientSecret: parsed.data.GITHUB_CLIENT_SECRET!,
            },
          }
        : {
            baseURL: parsed.data.PUBLIC_BASE_URL!,
            secret: parsed.data.AUTH_SECRET!,
            provider: {
              kind: 'oidc',
              issuer: parsed.data.OIDC_ISSUER!,
              discoveryURL: parsed.data.OIDC_DISCOVERY_URL!,
              clientId: parsed.data.OIDC_CLIENT_ID!,
              clientSecret: parsed.data.OIDC_CLIENT_SECRET!,
            },
          };

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
  }

  let legacyEventSettings: LegacyEventSettings | undefined;
  let legacyScheduleForBaseline: readonly Slot[] | undefined;
  if (authMode === 'legacy-single') {
    let eventEndAt: Date;
    let numberScope: 'daily' | 'event';
    let slotSchedule: readonly Slot[];
    if (tenantManifest !== undefined) {
      const defaultTenant = tenantManifest.tenants.find(
        (tenant) => tenant.id === DEFAULT_TENANT_ID,
      );
      const defaultEvent = defaultTenant?.events.find(
        (event) => event.id === DEFAULT_EVENT_ID,
      );
      if (defaultEvent === undefined) {
        throw new Error(
          'Invalid application manifest: fixed default event is missing.',
        );
      }
      const equipmentMatchesLegacy =
        defaultEvent.equipment.length ===
          Object.keys(legacyEquipmentById).length &&
        defaultEvent.equipment.every(
          ({ id, label }) => legacyEquipmentById[id] === label,
        );
      const scheduleMatchesLegacy = defaultEvent.schedule.every(
        ({
          firstStart,
          lastStart,
          intervalMinutes,
          experienceMinutes,
          turnoverMinutes,
        }) =>
          intervalMinutes === 30 &&
          experienceMinutes === 25 &&
          turnoverMinutes === 5 &&
          Number(firstStart.slice(3)) % 30 === 0 &&
          Number(lastStart.slice(3)) % 30 === 0,
      );
      if (
        defaultEvent.timeZone !== 'Asia/Tokyo' ||
        !equipmentMatchesLegacy ||
        !scheduleMatchesLegacy
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
      slotSchedule = legacySchedule.value.map((slot) => {
        const configuredEquipment = defaultEvent.equipment.find(
          ({ id }) => legacyEquipmentById[id] === slot.equipment,
        );
        if (configuredEquipment === undefined) {
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
        legacyScheduleForBaseline = oldSchedule.value;
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
      legacyScheduleForBaseline = legacySchedule.value;
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
    legacyEventSettings = { eventEndAt, numberScope, slotSchedule };
  }

  const legacyBaselineFields = [
    parsed.data.EVENT_END_AT,
    parsed.data.SLOT_SCHEDULE_JSON,
    parsed.data.TICKET_NUMBER_SCOPE,
  ];
  const hasAnyLegacyBaselineField = legacyBaselineFields.some(
    (value) => value !== undefined,
  );
  const hasCompleteLegacyBaseline = legacyBaselineFields.every(
    (value) => value !== undefined,
  );
  if (
    authMode === 'oidc/shared' &&
    hasAnyLegacyBaselineField &&
    !hasCompleteLegacyBaseline
  ) {
    throw new Error(
      'Invalid application environment: legacy baseline requires EVENT_END_AT, SLOT_SCHEDULE_JSON, and TICKET_NUMBER_SCOPE.',
    );
  }

  let legacyEventBaseline: LegacyEventBaseline | undefined;
  if (hasCompleteLegacyBaseline) {
    const baselineEndAt = parsed.data.EVENT_END_AT;
    const baselineScheduleText = parsed.data.SLOT_SCHEDULE_JSON;
    const baselineNumberScope = parsed.data.TICKET_NUMBER_SCOPE;
    if (
      baselineEndAt === undefined ||
      !/(?:Z|[+-]\d{2}:\d{2})$/i.test(baselineEndAt) ||
      !Number.isFinite(Date.parse(baselineEndAt)) ||
      baselineScheduleText === undefined ||
      baselineNumberScope === undefined
    ) {
      throw new Error(
        'Invalid application environment: legacy baseline settings are invalid.',
      );
    }
    let baselineSlots: readonly Slot[];
    if (legacyScheduleForBaseline !== undefined) {
      baselineSlots = legacyScheduleForBaseline;
    } else {
      const parsedBaselineSchedule = parseSlotSchedule(baselineScheduleText);
      if (!parsedBaselineSchedule.ok) {
        throw new Error(
          'Invalid application environment: SLOT_SCHEDULE_JSON is invalid.',
        );
      }
      baselineSlots = parsedBaselineSchedule.value;
    }
    const finalLegacySlotEnd = Math.max(
      ...baselineSlots.map(
        ({ slotStartsAt }) => Date.parse(slotStartsAt) + 30 * 60_000,
      ),
    );
    if (Date.parse(baselineEndAt) < finalLegacySlotEnd) {
      throw new Error(
        'Invalid application environment: EVENT_END_AT must be at or after the final slot end.',
      );
    }
    legacyEventBaseline = {
      timeZone: 'Asia/Tokyo',
      endsAt: new Date(baselineEndAt).toISOString(),
      numberScope: baselineNumberScope,
      equipmentIds: Object.keys(legacyEquipmentById).sort(),
    };
  }

  if (authMode === 'legacy-single') {
    if (legacyEventSettings === undefined) {
      throw new Error(
        'Invalid application environment: legacy event settings are required.',
      );
    }
    return {
      databaseUrl,
      authMode,
      adminToken: parsed.data.ADMIN_TOKEN!,
      agentToken: parsed.data.AGENT_TOKEN!,
      legacyEventSettings,
      ...(legacyEventBaseline === undefined ? {} : { legacyEventBaseline }),
      ...(tenantManifest === undefined ? {} : { tenantManifest }),
    };
  }
  if (sharedAuth === undefined || tenantManifest === undefined) {
    throw new Error(
      'Invalid application environment: shared authentication and tenant manifest are required.',
    );
  }
  return {
    databaseUrl,
    authMode,
    sharedAuth,
    tenantManifest,
    ...(legacyEventBaseline === undefined ? {} : { legacyEventBaseline }),
  };
}
