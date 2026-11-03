import { createFileRoute } from '@tanstack/react-router';
import { TicketScreen } from '../features/ticket/ticket-screen.tsx';

export const Route = createFileRoute('/ticket/$token')({
  component: TicketRoute,
});

function TicketRoute() {
  const { token } = Route.useParams();
  return <TicketScreen token={token} />;
}
