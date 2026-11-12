import {
  expandManifestSchedule,
  type ManifestEvent,
} from '../domain/tenant-manifest.ts';
import type { Slot } from '../domain/ticket.ts';

export type EventRequestSettings = {
  eventEndAt: Date;
  numberScope: ManifestEvent['numberScope'];
  slotSchedule: Slot[];
  timeZone: string;
  version2Print: {
    timeZone: string;
    publicBaseURL: string;
    copy: ManifestEvent['copy'];
  };
};

export type LegacyEventSettings = {
  eventEndAt: Date;
  numberScope: ManifestEvent['numberScope'];
  slotSchedule: readonly Slot[];
};

export function eventRequestSettings(
  event: ManifestEvent,
  publicBaseURL: string,
): EventRequestSettings {
  const equipmentLabels = new Map(
    event.equipment.map(({ id, label }) => [id, label]),
  );
  const slotSchedule = expandManifestSchedule(event).map((slot) => {
    const equipment = equipmentLabels.get(slot.equipmentId);
    if (equipment === undefined) {
      throw new Error('Event schedule references unknown equipment.');
    }
    return {
      slotStartsAt: slot.startsAt,
      equipment,
      experienceMinutes: slot.experienceMinutes,
      intervalMinutes: slot.intervalMinutes,
    };
  });
  return {
    eventEndAt: new Date(event.endsAt),
    numberScope: event.numberScope,
    slotSchedule,
    timeZone: event.timeZone,
    version2Print: {
      timeZone: event.timeZone,
      publicBaseURL,
      copy: event.copy,
    },
  };
}
