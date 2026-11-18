import { createFileRoute } from '@tanstack/react-router';
import { EventWizard } from '../features/management/event-wizard.tsx';
import { RequireSession } from '../session/require-session.tsx';

export const Route = createFileRoute('/t/$tenantSlug/manage/events/new')({
  component: EventWizardRoute,
});

function EventWizardRoute() {
  const { tenantSlug } = Route.useParams();
  return (
    <RequireSession purpose="イベントを作成する">
      <EventWizard key={tenantSlug} tenantSlug={tenantSlug} />
    </RequireSession>
  );
}
