import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client.ts';
import type { paths } from '../../api/schema.ts';

type PublicTicket =
  paths['/api/public/tickets/{token}']['get']['responses'][200]['content']['application/json'];

type TicketLookup =
  | { kind: 'ticket'; ticket: PublicTicket }
  | { kind: 'not-found' }
  | { kind: 'expired' };

export const PUBLIC_TICKET_POLL_INTERVAL = 5_000;

export function usePublicTicket(token: string) {
  return useQuery({
    queryKey: ['public-ticket', token],
    queryFn: async (): Promise<TicketLookup> => {
      const { data, error, response } = await apiClient.GET(
        '/api/public/tickets/{token}',
        { params: { path: { token } } },
      );
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
