import { type ReactNode, useMemo } from 'react';
import { useAdminReservations } from '../admin/admin-api.ts';
import { useScopeIsolation } from './scope-api.ts';
import { ScopeErrorView, scopeErrorStatus } from './scope-views.tsx';

/**
 * URL の tenant/event に対するサーバーの認可結果で表示を決める。
 * UI の出し分けではなく API の 403/404 が正本。reservations は AdminScreen と
 * 同じ query key なのでキャッシュと通信は共有される。
 * scope が変わると旧 scope の通信は abort されキャッシュも破棄される。
 */
export function ScopeGate({
  tenantSlug,
  eventSlug,
  children,
}: {
  tenantSlug: string;
  eventSlug: string;
  children: ReactNode;
}) {
  const scope = useMemo(
    () => ({ tenantSlug, eventSlug }),
    [tenantSlug, eventSlug],
  );
  useScopeIsolation(scope);
  const reservations = useAdminReservations(scope);
  const status = scopeErrorStatus(reservations.error);
  if (status !== null) return <ScopeErrorView status={status} />;
  return children;
}
