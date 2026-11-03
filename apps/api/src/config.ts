import { z } from 'zod';
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
    EVENT_END_AT: z
      .string()
      .refine(
        (value) =>
          /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) &&
          Number.isFinite(Date.parse(value)),
        'must be an ISO 8601 timestamp with a timezone',
      ),
    SLOT_SCHEDULE_JSON: z.string().min(1),
    TICKET_NUMBER_SCOPE: z.enum(['daily', 'event']).default('daily'),
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

  const slotSchedule = parseSlotSchedule(parsed.data.SLOT_SCHEDULE_JSON);
  if (!slotSchedule.ok) {
    throw new Error(
      'Invalid application environment: SLOT_SCHEDULE_JSON is invalid.',
    );
  }
  const eventEndAt = new Date(parsed.data.EVENT_END_AT);
  const lastSlotEndAt = Math.max(
    ...slotSchedule.value.map(
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
    numberScope: parsed.data.TICKET_NUMBER_SCOPE,
    slotSchedule: slotSchedule.value,
  };
}
