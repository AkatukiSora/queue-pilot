import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useScopeIsolation } from './scope-api.ts';

function IsolatedScope({
  tenantSlug,
  eventSlug,
}: {
  tenantSlug: string;
  eventSlug: string;
}) {
  useScopeIsolation({ tenantSlug, eventSlug });
  return <p>{`scope:${tenantSlug}/${eventSlug}`}</p>;
}

afterEach(() => cleanup());

it('removes agent query cache entries when leaving their tenant/event scope', () => {
  const client = new QueryClient();
  client.setQueryData(['admin', 'acme', 'old'], { old: true });
  client.setQueryData(['agents', 'acme', 'old'], [{ id: 'old-agent' }]);
  const view = render(
    <QueryClientProvider client={client}>
      <IsolatedScope tenantSlug="acme" eventSlug="old" />
    </QueryClientProvider>,
  );

  view.rerender(
    <QueryClientProvider client={client}>
      <IsolatedScope tenantSlug="acme" eventSlug="new" />
    </QueryClientProvider>,
  );

  expect(
    client.getQueryCache().find({ queryKey: ['admin', 'acme', 'old'] }),
  ).toBeUndefined();
  expect(
    client.getQueryCache().find({ queryKey: ['agents', 'acme', 'old'] }),
  ).toBeUndefined();
});
