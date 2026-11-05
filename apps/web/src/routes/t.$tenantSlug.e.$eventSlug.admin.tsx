import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { AdminScreen } from '../features/admin/admin-screen.tsx';
import { AgentsPanel } from '../features/agents/agents-panel.tsx';
import {
  adminScopePath,
  useMemberEvents,
} from '../features/scope/scope-api.ts';
import { ScopeGate } from '../features/scope/scope-gate.tsx';
import { ScopeSwitcher } from '../features/scope/scope-views.tsx';
import { RequireSession } from '../session/require-session.tsx';
import { useSession } from '../session/session.tsx';

export const Route = createFileRoute('/t/$tenantSlug/e/$eventSlug/admin')({
  component: AdminRoute,
});

function AdminRoute() {
  const { tenantSlug, eventSlug } = Route.useParams();
  return (
    <RequireSession>
      <AuthenticatedAdmin tenantSlug={tenantSlug} eventSlug={eventSlug} />
    </RequireSession>
  );
}

function AuthenticatedAdmin(scope: { tenantSlug: string; eventSlug: string }) {
  const { logout } = useSession();
  const events = useMemberEvents();
  const navigate = useNavigate();
  return (
    <ScopeGate {...scope}>
      {events.data !== undefined && events.data.length > 1 && (
        <ScopeSwitcher
          events={events.data}
          current={scope}
          onSelect={(next) => void navigate({ to: adminScopePath(next) })}
        />
      )}
      <AdminScreen
        key={`${scope.tenantSlug}/${scope.eventSlug}`}
        {...scope}
        onLogout={logout}
      />
      <AgentsPanel scope={scope} />
    </ScopeGate>
  );
}
