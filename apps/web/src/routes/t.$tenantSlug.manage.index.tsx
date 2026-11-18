import { createFileRoute } from '@tanstack/react-router';
import { TenantManage } from '../features/management/tenant-manage.tsx';
import { RequireSession } from '../session/require-session.tsx';

export const Route = createFileRoute('/t/$tenantSlug/manage/')({
  component: TenantManageRoute,
});

function TenantManageRoute() {
  const { tenantSlug } = Route.useParams();
  return (
    <RequireSession purpose="テナントを管理する">
      <TenantManage key={tenantSlug} tenantSlug={tenantSlug} />
    </RequireSession>
  );
}
