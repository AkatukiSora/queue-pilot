import { createFileRoute } from '@tanstack/react-router';
import { EventManage } from '../features/management/event-manage.tsx';
import { RequireSession } from '../session/require-session.tsx';

export const Route = createFileRoute('/t/$tenantSlug/e/$eventSlug/manage')({
  component: EventManageRoute,
});

function EventManageRoute() {
  const { tenantSlug, eventSlug } = Route.useParams();
  return (
    <RequireSession purpose="イベントを設定する">
      <EventManage
        key={`${tenantSlug}/${eventSlug}`}
        tenantSlug={tenantSlug}
        eventSlug={eventSlug}
      />
    </RequireSession>
  );
}
