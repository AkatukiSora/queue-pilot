import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client.ts';

type PublicTicket = NonNullable<
  Awaited<ReturnType<typeof fetchPublicTicket>>['data']
>;

type TicketLookup =
  | { kind: 'ticket'; ticket: PublicTicket }
  | { kind: 'not-found' }
  | { kind: 'expired' };

export const PUBLIC_TICKET_POLL_INTERVAL = 5_000;

async function fetchPublicTicket(token: string) {
  return apiClient.GET('/api/public/tickets/{token}', {
    params: { path: { token } },
  });
}

export function usePublicTicket(token: string) {
  return useQuery({
    queryKey: ['public-ticket', token],
    queryFn: async (): Promise<TicketLookup> => {
      const { data, error, response } = await fetchPublicTicket(token);
      if (response.status === 404) return { kind: 'not-found' };
      if (response.status === 410) return { kind: 'expired' };
      if (error !== undefined || data === undefined) {
        throw new Error('Ticket status request failed.');
      }
      return { kind: 'ticket', ticket: data };
    },
    refetchInterval: PUBLIC_TICKET_POLL_INTERVAL,
  });
}
