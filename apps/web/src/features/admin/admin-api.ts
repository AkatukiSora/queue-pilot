import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { apiClient } from '../../api/client.ts';
import type { paths } from '../../api/schema.ts';

export const ADMIN_QUEUE_POLL_INTERVAL = 3_000;
export const ADMIN_TOKEN_STORAGE_KEY = 'bunkasai-ticket.admin-token';

type AdminQueue =
  paths['/api/admin/queue']['get']['responses'][200]['content']['application/json'];
type AdminTicketDetail =
  paths['/api/admin/tickets/{id}']['get']['responses'][200]['content']['application/json'];
export type AdminQueueTicket = AdminQueue['waiting'][number];
export type AdminPrintJob = AdminTicketDetail['printJobs'][number];
export type PrintJobStatus = AdminPrintJob['status'];

export type AdminAction =
  | { type: 'call' | 'serve' | 'recall' | 'reprint'; ticketId: string }
  | {
      type: 'cancel';
      ticketId: string;
      reason: 'visitor' | 'staff' | 'no_show';
    };

type ApiFailure = { error: { code: string; message: string } };

export class AdminApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

function adminHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function assertAdminResponse(
  response: Response,
  error: ApiFailure | undefined,
  onUnauthorized: () => void,
) {
  if (response.status === 401) {
    onUnauthorized();
    throw new AdminApiError(
      'unauthorized',
      '管理者トークンを再入力してください。',
      401,
    );
  }
  if (error !== undefined) {
    throw new AdminApiError(
      error.error.code,
      error.error.message,
      response.status,
    );
  }
}

export function adminErrorMessage(error: unknown) {
  if (!(error instanceof AdminApiError)) {
    return '通信に失敗しました。ネットワークを確認して再試行してください。';
  }
  if (error.code === 'print_job_not_reprintable') {
    return '印刷待ちまたは印刷中のため再印刷できません。最新状態を確認してください。';
  }
  if (error.code === 'invalid_transition') {
    return '状態が更新済みの可能性があります。最新状態を確認してください。';
  }
  if (error.code === 'idempotency_key_reuse') {
    return '発券内容が一致しません。同じ発券操作を再試行してください。';
  }
  return '操作に失敗しました。最新状態を確認して再試行してください。';
}

export function canReprint(status: PrintJobStatus | undefined) {
  return status === 'printed' || status === 'failed' || status === 'unknown';
}

export function useAdminQueue(token: string, onUnauthorized: () => void) {
  return useQuery({
    queryKey: ['admin', 'queue'],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET(
        '/api/admin/queue',
        { headers: adminHeaders(token) },
      );
      assertAdminResponse(response, error, onUnauthorized);
      if (data === undefined)
        throw new Error('管理一覧を取得できませんでした。');
      return data;
    },
    refetchInterval: ADMIN_QUEUE_POLL_INTERVAL,
  });
}

export function useAdminTicketDetail(
  token: string,
  ticketId: string,
  enabled: boolean,
  onUnauthorized: () => void,
) {
  return useQuery({
    queryKey: ['admin', 'ticket', ticketId],
    enabled,
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET(
        '/api/admin/tickets/{id}',
        {
          params: { path: { id: ticketId } },
          headers: adminHeaders(token),
        },
      );
      assertAdminResponse(response, error, onUnauthorized);
      if (data === undefined)
        throw new Error('印刷履歴を取得できませんでした。');
      return data;
    },
    refetchInterval: enabled ? ADMIN_QUEUE_POLL_INTERVAL : false,
  });
}

export function useAdminAction(token: string, onUnauthorized: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action: AdminAction) => {
      const options = {
        params: { path: { id: action.ticketId } },
        headers: adminHeaders(token),
      };
      switch (action.type) {
        case 'call': {
          const result = await apiClient.POST(
            '/api/admin/tickets/{id}/call',
            options,
          );
          assertAdminResponse(result.response, result.error, onUnauthorized);
          break;
        }
        case 'serve': {
          const result = await apiClient.POST(
            '/api/admin/tickets/{id}/serve',
            options,
          );
          assertAdminResponse(result.response, result.error, onUnauthorized);
          break;
        }
        case 'recall': {
          const result = await apiClient.POST(
            '/api/admin/tickets/{id}/recall',
            options,
          );
          assertAdminResponse(result.response, result.error, onUnauthorized);
          break;
        }
        case 'cancel': {
          const result = await apiClient.POST(
            '/api/admin/tickets/{id}/cancel',
            { ...options, body: { reason: action.reason } },
          );
          assertAdminResponse(result.response, result.error, onUnauthorized);
          break;
        }
        case 'reprint': {
          const result = await apiClient.POST(
            '/api/admin/tickets/{id}/reprint',
            options,
          );
          assertAdminResponse(result.response, result.error, onUnauthorized);
          break;
        }
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}

export function useIssueTicket(token: string, onUnauthorized: () => void) {
  const queryClient = useQueryClient();
  const retryRequest = useRef<null | { key: string; partySize: number }>(null);
  const mutation = useMutation({
    mutationFn: async (request: { key: string; partySize: number }) => {
      const { data, error, response } = await apiClient.POST(
        '/api/admin/tickets',
        {
          params: { header: { 'idempotency-key': request.key } },
          headers: adminHeaders(token),
          body: { partySize: request.partySize },
        },
      );
      assertAdminResponse(response, error, onUnauthorized);
      if (data === undefined)
        throw new Error('発券結果を取得できませんでした。');
      return data.ticket;
    },
    onSuccess: async () => {
      retryRequest.current = null;
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });

  return {
    mutation,
    issue(partySize: number) {
      if (!Number.isInteger(partySize) || partySize < 1 || partySize > 20)
        return;
      retryRequest.current = { key: crypto.randomUUID(), partySize };
      mutation.reset();
      mutation.mutate(retryRequest.current);
    },
    retry() {
      if (retryRequest.current === null || mutation.isPending) return;
      mutation.mutate(retryRequest.current);
    },
  };
}
