import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { assertApiOk } from '../../api/api-error.ts';
import { apiClient } from '../../api/client.ts';
import type { paths } from '../../api/schema.ts';

export type MemberEvent =
  paths['/api/v3/events']['get']['responses'][200]['content']['application/json']['events'][number];

export const MEMBER_EVENTS_QUERY_KEY = ['member-events'] as const;

/** 現在のユーザーが入れる tenant/event だけをサーバーから取得する。 */
export function useMemberEvents() {
  return useQuery({
    queryKey: MEMBER_EVENTS_QUERY_KEY,
    queryFn: async ({ signal }) => {
      const { data, error, response } = await apiClient.GET('/api/v3/events', {
        signal,
      });
      assertApiOk(response, error);
      if (data === undefined)
        throw new Error('イベント一覧を取得できませんでした。');
      return data.events;
    },
  });
}

export function adminScopePath(scope: {
  tenantSlug: string;
  eventSlug: string;
}) {
  return `/t/${encodeURIComponent(scope.tenantSlug)}/e/${encodeURIComponent(scope.eventSlug)}/admin`;
}

/**
 * tenant/event が切り替わる (または画面を離れる) とき、旧 scope の
 * 実行中 query を abort し、キャッシュも捨てる。旧 scope の応答が
 * 新 scope の下で適用されることはない。
 */
export function useScopeIsolation(scope: {
  tenantSlug: string;
  eventSlug: string;
}) {
  const queryClient = useQueryClient();
  const { tenantSlug, eventSlug } = scope;
  useEffect(() => {
    const queryKey = ['admin', tenantSlug, eventSlug];
    return () => {
      void queryClient.cancelQueries({ queryKey });
      queryClient.removeQueries({ queryKey });
    };
  }, [queryClient, tenantSlug, eventSlug]);
}
