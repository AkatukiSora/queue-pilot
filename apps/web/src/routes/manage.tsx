import { createFileRoute } from '@tanstack/react-router';
import { ManageHome } from '../features/management/manage-home.tsx';
import { RequireSession } from '../session/require-session.tsx';

export const Route = createFileRoute('/manage')({
  component: () => (
    <RequireSession purpose="テナントを管理する">
      <ManageHome />
    </RequireSession>
  ),
});
