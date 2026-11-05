import { createFileRoute } from '@tanstack/react-router';
import { useMemberEvents } from '../features/scope/scope-api.ts';
import { EventPicker } from '../features/scope/scope-views.tsx';
import { RequireSession } from '../session/require-session.tsx';

export const Route = createFileRoute('/admin')({
  component: () => (
    <RequireSession>
      <EventSelection />
    </RequireSession>
  ),
});

function EventSelection() {
  const events = useMemberEvents();
  return (
    <EventPicker
      events={events.data}
      isPending={events.isPending}
      error={events.error}
      onRetry={() => void events.refetch()}
    />
  );
}
