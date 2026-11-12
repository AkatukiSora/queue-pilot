import { Temporal } from '@js-temporal/polyfill';
import { z } from 'zod';
import type { Result } from './result.ts';
import type { Equipment, SlotStart } from './ticket.ts';

export const DEFAULT_TENANT_ID =
  '00000000-0000-4000-8000-000000000001' as TenantId;
export const DEFAULT_EVENT_ID =
  '00000000-0000-4000-8000-000000000002' as EventId;
export const LEGACY_COMPAT_AGENT_ID = '00000000-0000-4000-8000-000000000003';

export const legacyEquipmentById: Record<string, Equipment> = {
  'quest-3': 'Quest 3',
  'quest-3s': 'Quest 3S',
  'steam-frame': 'Steam Frame',
  beyond2: 'Beyond2',
};

export type TenantId = string & { readonly __brand: 'TenantId' };
export type EventId = string & { readonly __brand: 'EventId' };
export type EquipmentId = string & { readonly __brand: 'EquipmentId' };
export type PrinterId = string & { readonly __brand: 'PrinterId' };

const tenantIdSchema = z.uuid().transform((value) => value as TenantId);
const eventIdSchema = z.uuid().transform((value) => value as EventId);
const equipmentIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .transform((value) => value as EquipmentId);
const printerIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .transform((value) => value as PrinterId);
const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(63);
const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const eventSchema = z
  .object({
    id: eventIdSchema,
    slug: slugSchema,
    title: z.string().min(1),
    timeZone: z.string().min(1),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    numberScope: z.enum(['daily', 'event']),
    equipment: z
      .array(
        z.object({ id: equipmentIdSchema, label: z.string().min(1) }).strict(),
      )
      .min(1),
    schedule: z
      .array(
        z
          .object({
            date: dateSchema,
            firstStart: timeSchema,
            lastStart: timeSchema,
            intervalMinutes: z.number().int().positive(),
            experienceMinutes: z.number().int().positive(),
            turnoverMinutes: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .min(1),
    copy: z
      .object({
        receiptTitle: z.string().min(1),
        arrivalGuidance: z.string().min(1),
      })
      .strict(),
    defaultPrinterId: printerIdSchema,
    printers: z
      .array(
        z.object({ id: printerIdSchema, label: z.string().min(1) }).strict(),
      )
      .min(1),
  })
  .strict();

const tenantManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    tenants: z
      .array(
        z
          .object({
            id: tenantIdSchema,
            slug: slugSchema,
            displayName: z.string().min(1),
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
            events: z.array(eventSchema).min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((manifest, context) => {
    const tenantIds = new Set<string>();
    const tenantSlugs = new Set<string>();
    const eventIds = new Set<string>();
    for (const [tenantIndex, tenant] of manifest.tenants.entries()) {
      if (tenantIds.has(tenant.id)) {
        context.addIssue({
          code: 'custom',
          path: ['tenants', tenantIndex, 'id'],
          message: 'tenant IDs must be unique',
        });
      }
      if (tenantSlugs.has(tenant.slug)) {
        context.addIssue({
          code: 'custom',
          path: ['tenants', tenantIndex, 'slug'],
          message: 'tenant slugs must be unique',
        });
      }
      tenantIds.add(tenant.id);
      tenantSlugs.add(tenant.slug);
      const memberIdentities = new Set<string>();
      for (const [memberIndex, member] of tenant.members.entries()) {
        const identity = `${member.issuer}\u0000${member.subject}`;
        if (memberIdentities.has(identity)) {
          context.addIssue({
            code: 'custom',
            path: ['tenants', tenantIndex, 'members', memberIndex],
            message: 'member issuer and subject must be unique per tenant',
          });
        }
        memberIdentities.add(identity);
      }

      const eventSlugs = new Set<string>();
      for (const [eventIndex, event] of tenant.events.entries()) {
        if (eventIds.has(event.id)) {
          context.addIssue({
            code: 'custom',
            path: ['tenants', tenantIndex, 'events', eventIndex, 'id'],
            message: 'event IDs must be unique',
          });
        }
        if (eventSlugs.has(event.slug)) {
          context.addIssue({
            code: 'custom',
            path: ['tenants', tenantIndex, 'events', eventIndex, 'slug'],
            message: 'event slugs must be unique per tenant',
          });
        }
        eventIds.add(event.id);
        eventSlugs.add(event.slug);
        const equipmentIds = new Set<string>();
        for (const [equipmentIndex, equipment] of event.equipment.entries()) {
          if (equipmentIds.has(equipment.id)) {
            context.addIssue({
              code: 'custom',
              path: [
                'tenants',
                tenantIndex,
                'events',
                eventIndex,
                'equipment',
                equipmentIndex,
                'id',
              ],
              message: 'equipment IDs must be unique per event',
            });
          }
          equipmentIds.add(equipment.id);
        }
        const printerIds = new Set<string>();
        for (const [printerIndex, printer] of event.printers.entries()) {
          if (printerIds.has(printer.id)) {
            context.addIssue({
              code: 'custom',
              path: [
                'tenants',
                tenantIndex,
                'events',
                eventIndex,
                'printers',
                printerIndex,
                'id',
              ],
              message: 'printer IDs must be unique per event',
            });
          }
          printerIds.add(printer.id);
        }
        if (!printerIds.has(event.defaultPrinterId)) {
          context.addIssue({
            code: 'custom',
            path: [
              'tenants',
              tenantIndex,
              'events',
              eventIndex,
              'defaultPrinterId',
            ],
            message: 'default printer must exist in printers',
          });
        }

        let eventStart: Temporal.Instant;
        let eventEnd: Temporal.Instant;
        try {
          eventStart = Temporal.Instant.from(event.startsAt);
          eventEnd = Temporal.Instant.from(event.endsAt);
        } catch (error) {
          if (!(error instanceof RangeError)) throw error;
          context.addIssue({
            code: 'custom',
            path: ['tenants', tenantIndex, 'events', eventIndex],
            message: 'event bounds must be valid instants',
          });
          continue;
        }
        if (Temporal.Instant.compare(eventStart, eventEnd) > 0) {
          context.addIssue({
            code: 'custom',
            path: ['tenants', tenantIndex, 'events', eventIndex, 'endsAt'],
            message: 'endsAt must not precede startsAt',
          });
        }
        if (/^[+-]\d{2}(?::?\d{2})?$/.test(event.timeZone)) {
          context.addIssue({
            code: 'custom',
            path: ['tenants', tenantIndex, 'events', eventIndex, 'timeZone'],
            message: 'timeZone must be an IANA time-zone identifier',
          });
          continue;
        }

        const scheduleDates = new Set<string>();
        const intervalsByEquipment = new Map<
          string,
          Array<{ start: bigint; end: bigint }>
        >();
        for (const [scheduleIndex, schedule] of event.schedule.entries()) {
          const schedulePath = [
            'tenants',
            tenantIndex,
            'events',
            eventIndex,
            'schedule',
            scheduleIndex,
          ];
          let date: Temporal.PlainDate;
          try {
            date = Temporal.PlainDate.from(schedule.date);
          } catch (error) {
            if (!(error instanceof RangeError)) throw error;
            context.addIssue({
              code: 'custom',
              path: [...schedulePath, 'date'],
              message: 'date must be a valid calendar date',
            });
            continue;
          }
          if (date.toString() !== schedule.date) {
            context.addIssue({
              code: 'custom',
              path: [...schedulePath, 'date'],
              message: 'date must use YYYY-MM-DD format',
            });
            continue;
          }
          if (scheduleDates.has(schedule.date)) {
            context.addIssue({
              code: 'custom',
              path: [...schedulePath, 'date'],
              message: 'schedule dates must be unique per event',
            });
            continue;
          }
          scheduleDates.add(schedule.date);
          if (
            schedule.intervalMinutes !==
            schedule.experienceMinutes + schedule.turnoverMinutes
          ) {
            context.addIssue({
              code: 'custom',
              path: [...schedulePath, 'intervalMinutes'],
              message:
                'intervalMinutes must equal experienceMinutes plus turnoverMinutes',
            });
            continue;
          }

          const firstMinutes =
            Number(schedule.firstStart.slice(0, 2)) * 60 +
            Number(schedule.firstStart.slice(3));
          const lastMinutes =
            Number(schedule.lastStart.slice(0, 2)) * 60 +
            Number(schedule.lastStart.slice(3));
          if (
            firstMinutes > lastMinutes ||
            (lastMinutes - firstMinutes) % schedule.intervalMinutes !== 0
          ) {
            context.addIssue({
              code: 'custom',
              path: schedulePath,
              message:
                'lastStart must be reachable from firstStart by intervalMinutes',
            });
            continue;
          }

          for (
            let minute = firstMinutes;
            minute <= lastMinutes;
            minute += schedule.intervalMinutes
          ) {
            const localStart = date.toPlainDateTime({
              hour: Math.floor(minute / 60),
              minute: minute % 60,
            });
            const localReservationEnd = localStart.add({
              minutes: schedule.intervalMinutes,
            });
            let startsAt: Temporal.Instant;
            try {
              startsAt = localStart
                .toZonedDateTime(event.timeZone, { disambiguation: 'reject' })
                .toInstant();
              localReservationEnd.toZonedDateTime(event.timeZone, {
                disambiguation: 'reject',
              });
            } catch (error) {
              if (!(error instanceof RangeError)) throw error;
              context.addIssue({
                code: 'custom',
                path: schedulePath,
                message:
                  'schedule contains a nonexistent or ambiguous local time',
              });
              break;
            }
            const reservationEnd = startsAt.add({
              minutes: schedule.intervalMinutes,
            });
            if (
              Temporal.Instant.compare(startsAt, eventStart) < 0 ||
              Temporal.Instant.compare(reservationEnd, eventEnd) > 0
            ) {
              context.addIssue({
                code: 'custom',
                path: schedulePath,
                message: 'schedule interval must be within event bounds',
              });
            }
            for (const equipment of event.equipment) {
              const intervals = intervalsByEquipment.get(equipment.id) ?? [];
              intervals.push({
                start: startsAt.epochNanoseconds,
                end: reservationEnd.epochNanoseconds,
              });
              intervalsByEquipment.set(equipment.id, intervals);
            }
          }
        }

        for (const intervals of intervalsByEquipment.values()) {
          intervals.sort((left, right) =>
            left.start < right.start ? -1 : left.start > right.start ? 1 : 0,
          );
          for (let index = 1; index < intervals.length; index += 1) {
            const previous = intervals[index - 1];
            const current = intervals[index];
            if (previous && current && current.start < previous.end) {
              context.addIssue({
                code: 'custom',
                path: [
                  'tenants',
                  tenantIndex,
                  'events',
                  eventIndex,
                  'schedule',
                ],
                message:
                  'schedule intervals must not overlap for the same equipment',
              });
              break;
            }
          }
        }
      }
    }
  });

export type TenantManifest = z.infer<typeof tenantManifestSchema>;
export type ManifestTenant = TenantManifest['tenants'][number];
export type ManifestEvent = ManifestTenant['events'][number];
export type InvalidManifestEvent = {
  kind: 'InvalidManifestEvent';
  issues: Array<{ path: string; message: string }>;
};
export type LegacyEventBaseline = {
  timeZone: 'Asia/Tokyo';
  endsAt: string;
  numberScope: 'daily' | 'event';
  equipmentIds: readonly string[];
};

export type ManifestScheduleSlot = {
  startsAt: SlotStart;
  endsAt: string;
  equipmentId: EquipmentId;
  experienceMinutes: number;
  intervalMinutes: number;
};
export type InvalidTenantManifest = {
  kind: 'InvalidTenantManifest';
  issues: Array<{ path: string; message: string }>;
};

export function parseManifestEvent(
  input: unknown,
): Result<ManifestEvent, InvalidManifestEvent> {
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        kind: 'InvalidManifestEvent',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.') || 'event',
          message: issue.message,
        })),
      },
    };
  }
  return { ok: true, value: parsed.data };
}

export function parseTenantManifest(
  input: unknown,
): Result<TenantManifest, InvalidTenantManifest> {
  const parsed = tenantManifestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        kind: 'InvalidTenantManifest',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.') || 'manifest',
          message: issue.message,
        })),
      },
    };
  }
  return { ok: true, value: parsed.data };
}

export function expandManifestSchedule(
  event: ManifestEvent,
): ManifestScheduleSlot[] {
  const slots: ManifestScheduleSlot[] = [];
  for (const schedule of event.schedule) {
    const date = Temporal.PlainDate.from(schedule.date);
    const firstMinutes =
      Number(schedule.firstStart.slice(0, 2)) * 60 +
      Number(schedule.firstStart.slice(3));
    const lastMinutes =
      Number(schedule.lastStart.slice(0, 2)) * 60 +
      Number(schedule.lastStart.slice(3));
    for (
      let minute = firstMinutes;
      minute <= lastMinutes;
      minute += schedule.intervalMinutes
    ) {
      const localStart = date.toPlainDateTime({
        hour: Math.floor(minute / 60),
        minute: minute % 60,
      });
      const zonedStart = localStart.toZonedDateTime(event.timeZone, {
        disambiguation: 'reject',
      });
      const startsAt = zonedStart.toInstant();
      const endsAt = startsAt.add({ minutes: schedule.experienceMinutes });
      for (const equipment of event.equipment) {
        slots.push({
          startsAt: startsAt.toString({
            smallestUnit: 'millisecond',
          }) as SlotStart,
          endsAt: endsAt.toString(),
          equipmentId: equipment.id,
          experienceMinutes: schedule.experienceMinutes,
          intervalMinutes: schedule.intervalMinutes,
        });
      }
    }
  }
  return slots;
}
