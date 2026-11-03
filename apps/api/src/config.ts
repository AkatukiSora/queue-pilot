import { z } from 'zod';

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

  return {
    databaseUrl: parsed.data.DATABASE_URL,
    adminToken: parsed.data.ADMIN_TOKEN,
    agentToken: parsed.data.AGENT_TOKEN,
    eventEndAt: new Date(parsed.data.EVENT_END_AT),
    numberScope: parsed.data.TICKET_NUMBER_SCOPE,
  };
}
