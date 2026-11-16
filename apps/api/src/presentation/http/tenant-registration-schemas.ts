import { z } from '@hono/zod-openapi';

export const tenantRegistrationCreateBodySchema = z
  .object({
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(63),
    displayName: z
      .string()
      .min(1)
      .max(120)
      .refine((value) => value.trim().length > 0),
  })
  .strict();

export const tenantRegistrationPolicySchema = z
  .object({
    enabled: z.boolean(),
    policy: z.enum(['closed', 'allowlist', 'public']),
    eligible: z.boolean(),
    reason: z
      .enum([
        'registration_disabled',
        'registration_closed',
        'unsupported_identity',
        'not_allowlisted',
        'identity_disabled',
        'tenant_limit',
        'tenant_total_limit',
        'reauth_required',
        'organization_unavailable',
      ])
      .nullable(),
    maxPerUser: z.number().int().positive(),
    remainingForUser: z.number().int().nonnegative(),
  })
  .strict();

export const tenantRegistrationCreatedSchema = z
  .object({
    tenant: z
      .object({
        id: z.uuid(),
        slug: z.string(),
        displayName: z.string(),
        revision: z.number().int().positive(),
      })
      .strict(),
    role: z.literal('admin'),
  })
  .strict();

export const tenantRegistrationErrorSchema = z
  .object({
    error: z.object({ code: z.string(), message: z.string() }).strict(),
  })
  .strict();
