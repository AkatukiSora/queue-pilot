import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AgentsPanel } from './agents-panel.tsx';

type IssuedToken = { id: string; token: string; expiresAt: string };
type MutationCallbacks = {
  onSuccess: (token: IssuedToken | null) => void;
  onError: (error: unknown) => void;
};

const fake = vi.hoisted(() => ({
  pending: new Map<string, boolean>(),
  callbacks: new Map<string, MutationCallbacks>(),
}));

vi.mock('./agents-api.ts', () => ({
  useScopeRole: () => ({ role: 'admin' }),
  useAgents: (scope: { eventSlug: string }) => ({
    data: [
      {
        id: `${scope.eventSlug}-agent`,
        printerId: `${scope.eventSlug}-printer`,
        expiresAt: '2026-12-01T00:00:00.000Z',
        revokedAt: null,
        lastSeenAt: null,
      },
    ],
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useAgentCommand: (scope: { eventSlug: string }) => ({
    isPending: fake.pending.get(scope.eventSlug) ?? false,
    isError: false,
    error: null,
    mutate: (_command: unknown, callbacks: MutationCallbacks) => {
      fake.pending.set(scope.eventSlug, true);
      fake.callbacks.set(scope.eventSlug, callbacks);
    },
  }),
  isUnknownOutcome: () => false,
  agentErrorMessage: () => '',
}));

const oldScope = { tenantSlug: 'acme', eventSlug: 'old' };
const newScope = { tenantSlug: 'acme', eventSlug: 'new' };

function startRotation() {
  fireEvent.click(screen.getByRole('button', { name: '再発行' }));
  fireEvent.click(screen.getByRole('button', { name: '再発行を実行' }));
}

afterEach(() => {
  cleanup();
  fake.pending.clear();
  fake.callbacks.clear();
});

it('clears an already issued token when switching admin event scope', () => {
  const view = render(<AgentsPanel scope={oldScope} />);
  startRotation();
  const oldCallbacks = fake.callbacks.get('old');
  if (oldCallbacks === undefined)
    throw new Error('Old mutation was not started.');
  act(() =>
    oldCallbacks.onSuccess({
      id: 'old-agent',
      token: 'old-event-token',
      expiresAt: '2026-12-02T00:00:00.000Z',
    }),
  );
  expect(screen.getByText('old-event-token')).toBeTruthy();

  view.rerender(<AgentsPanel scope={newScope} />);

  expect(screen.getByText(/new-printer/)).toBeTruthy();
  expect(screen.queryByText('old-event-token')).toBeNull();
});

it('discards a delayed old-event mutation result after switching scopes', () => {
  const view = render(<AgentsPanel scope={oldScope} />);
  startRotation();
  const oldCallbacks = fake.callbacks.get('old');
  if (oldCallbacks === undefined)
    throw new Error('Old mutation was not started.');

  view.rerender(<AgentsPanel scope={newScope} />);
  expect(screen.getByText(/new-printer/)).toBeTruthy();
  expect(
    (screen.getByRole('button', { name: '再発行' }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
  act(() =>
    oldCallbacks.onSuccess({
      id: 'old-agent',
      token: 'delayed-old-event-token',
      expiresAt: '2026-12-02T00:00:00.000Z',
    }),
  );

  expect(screen.queryByText('delayed-old-event-token')).toBeNull();
});
