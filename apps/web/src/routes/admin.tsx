import { createFileRoute } from '@tanstack/react-router';
import { AdminScreen } from '../features/admin/admin-screen.tsx';

export const Route = createFileRoute('/admin')({
  component: AdminScreen,
});
