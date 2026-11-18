import { createFileRoute } from '@tanstack/react-router';
import { SignupScreen } from '../features/management/signup-screen.tsx';
import { RequireSession } from '../session/require-session.tsx';

export const Route = createFileRoute('/signup')({
  component: () => (
    <RequireSession purpose="テナントを登録する">
      <SignupScreen />
    </RequireSession>
  ),
});
