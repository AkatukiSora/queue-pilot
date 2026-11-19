import { createFileRoute } from '@tanstack/react-router';
import { CreditsScreen } from '../features/credits/credits-screen.tsx';

export const Route = createFileRoute('/credits')({
  component: CreditsScreen,
});
