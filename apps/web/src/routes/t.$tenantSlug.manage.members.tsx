import { createFileRoute } from '@tanstack/react-router';
import { MembersScreen } from '../features/management/members-screen.tsx';
import { RequireSession } from '../session/require-session.tsx';

export const Route = createFileRoute('/t/$tenantSlug/manage/members')({
  component: MembersRoute,
});

function MembersRoute() {
  const { tenantSlug } = Route.useParams();
  return (
    <RequireSession purpose="メンバーを管理する">
      <MembersScreen key={tenantSlug} tenantSlug={tenantSlug} />
    </RequireSession>
  );
}
