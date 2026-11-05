import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, assertApiOk } from '../../api/api-error.ts';
import { apiClient } from '../../api/client.ts';
import type { paths } from '../../api/schema.ts';
import {
  MEMBER_EVENTS_QUERY_KEY,
  useMemberEvents,
} from '../scope/scope-api.ts';

export type AgentScope = { tenantSlug: string; eventSlug: string };

type AgentsPath = '/api/v3/t/{tenantSlug}/e/{eventSlug}/agents';
export type AgentSummary =
  paths[AgentsPath]['get']['responses'][200]['content']['application/json']['agents'][number];
export type IssuedAgentToken = {
  id: string;
  token: string;
  expiresAt: string;
};

/** mutation の応答待ちの上限。超えたら結果不明として扱い、自動では再送しない。 */
export const AGENT_MUTATION_TIMEOUT_MS = 15_000;

/** AbortSignal.timeout の代替 (jsdom の AbortSignal と Request で互換にするため)。 */
export function timeoutSignal(ms: number) {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

const agentsKey = (scope: AgentScope) =>
  ['agents', scope.tenantSlug, scope.eventSlug] as const;

/** URL の scope に対する現在のユーザーの role。サーバー応答に無ければ null。 */
export function useScopeRole(scope: AgentScope) {
  const events = useMemberEvents();
  const role =
    events.data?.find(
      (event) =>
        event.tenantSlug === scope.tenantSlug &&
        event.eventSlug === scope.eventSlug,
    )?.role ?? null;
  return { role, isPending: events.isPending };
}

export function useAgents(scope: AgentScope, enabled: boolean) {
  return useQuery({
    queryKey: agentsKey(scope),
    enabled,
    queryFn: async ({ signal }) => {
      const { data, error, response } = await apiClient.GET(
        '/api/v3/t/{tenantSlug}/e/{eventSlug}/agents',
        { params: { path: scope }, signal },
      );
      assertApiOk(response, error);
      if (data === undefined) throw new Error('Agent list is unavailable.');
      return data.agents;
    },
  });
}

/**
 * 結果が分からない失敗: 通信断・タイムアウト・5xx・成功応答なのに本文が読めない。
 * サーバーで処理済みの可能性があるため、自動再送も自動再印刷もしない。
 */
export function isUnknownOutcome(error: unknown) {
  return (
    !(error instanceof ApiError) ||
    error.code === 'ambiguous_response' ||
    error.status === undefined ||
    error.status >= 500
  );
}

export type AgentCommand = { type: 'rotate' | 'revoke'; agentId: string };

export function useAgentCommand(scope: AgentScope) {
  const queryClient = useQueryClient();
  return useMutation({
    // 既定で retry しない。結果不明でも再送は利用者の明示操作だけ。
    retry: false,
    mutationFn: async (command: AgentCommand) => {
      const init = {
        params: { path: { ...scope, id: command.agentId } },
        body: {},
        signal: timeoutSignal(AGENT_MUTATION_TIMEOUT_MS),
      };
      if (command.type === 'revoke') {
        const { data, error, response } = await apiClient.POST(
          '/api/v3/t/{tenantSlug}/e/{eventSlug}/agents/{id}/revoke',
          init,
        );
        assertApiOk(response, error);
        if (data?.revoked !== true) {
          throw new ApiError(
            'ambiguous_response',
            'Revoke response was unreadable.',
            response.status,
          );
        }
        return null;
      }
      const { data, error, response } = await apiClient.POST(
        '/api/v3/t/{tenantSlug}/e/{eventSlug}/agents/{id}/rotate',
        init,
      );
      assertApiOk(response, error);
      if (data === undefined) {
        throw new ApiError(
          'ambiguous_response',
          'Rotate response was unreadable.',
          response.status,
        );
      }
      return data satisfies IssuedAgentToken;
    },
    onSettled: async (_data, error) => {
      // 権限が変わった/古い画面の可能性: role を取り直して UI を追随させる。
      if (
        error instanceof ApiError &&
        (error.status === 403 || error.status === 404)
      ) {
        await queryClient.invalidateQueries({
          queryKey: MEMBER_EVENTS_QUERY_KEY,
        });
      }
      await queryClient.invalidateQueries({ queryKey: agentsKey(scope) });
    },
  });
}

export function agentErrorMessage(error: unknown) {
  if (isUnknownOutcome(error)) {
    return '操作の結果が不明です。サーバーで処理済みの可能性があります。自動では再実行しません。一覧を再読み込みして状態を確認してください。';
  }
  const status = error instanceof ApiError ? error.status : undefined;
  if (status === 401) {
    return 'ログインの有効期限が切れました。再ログインしてください。';
  }
  if (error instanceof ApiError && error.code === 'csrf_failed') {
    return '送信元の確認に失敗しました。ページを再読み込みして再試行してください。';
  }
  if (status === 403) return 'この操作を行う権限がありません。';
  if (status === 404)
    return '対象のエージェントまたはイベントが見つかりません。';
  return '操作に失敗しました。最新状態を確認してください。';
}
