import type { AdminReservations, AdminTicket } from './admin-api.ts';
import { ADMIN_EQUIPMENT_VALUES } from './admin-api.ts';

type TicketLists = Pick<
  AdminReservations,
  'slots' | 'legacyTickets' | 'unconfiguredTickets' | 'releasedTickets'
>;

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareTickets(left: AdminTicket, right: AdminTicket) {
  if (left.reservation.kind !== right.reservation.kind) {
    return left.reservation.kind === 'slot' ? -1 : 1;
  }
  if (left.reservation.kind === 'slot' && right.reservation.kind === 'slot') {
    const startsAt =
      Date.parse(left.reservation.slotStartsAt) -
      Date.parse(right.reservation.slotStartsAt);
    if (startsAt !== 0) return startsAt;
    const equipment =
      ADMIN_EQUIPMENT_VALUES.indexOf(left.reservation.equipment) -
      ADMIN_EQUIPMENT_VALUES.indexOf(right.reservation.equipment);
    if (equipment !== 0) return equipment;
  }
  return (
    compareText(left.counterKey, right.counterKey) ||
    left.number - right.number ||
    compareText(left.id, right.id)
  );
}

export function categorizeAdminTickets(reservations: TicketLists, now: number) {
  const uniqueTickets = new Map<string, AdminTicket>();
  for (const ticket of [
    ...reservations.slots.flatMap((slot) =>
      slot.ticket === null ? [] : [slot.ticket],
    ),
    ...reservations.legacyTickets,
    ...reservations.unconfiguredTickets,
    ...reservations.releasedTickets,
  ]) {
    if (!uniqueTickets.has(ticket.id)) uniqueTickets.set(ticket.id, ticket);
  }

  const categories = {
    active: [] as AdminTicket[],
    cancelled: [] as AdminTicket[],
    served: [] as AdminTicket[],
    past: [] as AdminTicket[],
  };
  for (const ticket of uniqueTickets.values()) {
    if (ticket.status === 'cancelled') {
      categories.cancelled.push(ticket);
    } else if (ticket.status === 'served') {
      categories.served.push(ticket);
    } else if (
      ticket.reservation.kind === 'slot' &&
      ticket.status === 'waiting' &&
      Date.parse(ticket.reservation.endsAt) <= now
    ) {
      categories.past.push(ticket);
    } else {
      categories.active.push(ticket);
    }
  }

  for (const tickets of Object.values(categories)) tickets.sort(compareTickets);
  return categories;
}
