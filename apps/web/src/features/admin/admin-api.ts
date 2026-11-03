import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { apiClient } from '../../api/client.ts';
import type { paths } from '../../api/schema.ts';

export const ADMIN_RESERVATIONS_POLL_INTERVAL = 3_000;
export const ADMIN_TOKEN_STORAGE_KEY = 'bunkasai-ticket.admin-token';

export type AdminReservations =
  paths['/api/admin/reservations']['get']['responses'][200]['content']['application/json'];
export type AdminSlot = AdminReservations['slots'][number];
export type AdminTicket =
  | Exclude<AdminSlot['ticket'], null>
  | AdminReservations['legacyTickets'][number]
  | AdminReservations['unconfiguredTickets'][number];

export const ADMIN_EQUIPMENT_VALUES = [
  'Quest 3',
  'Quest 3S',
  'Steam Frame',
  'Beyond2',
] as const satisfies readonly AdminSlot['equipment'][];
export const ADMIN_ISSUE_REQUEST_STORAGE_KEY =
  'bunkasai-ticket.admin-issue-request';

type IssueRequest = {
  key: string;
  slotStartsAt: string;
  equipment: AdminSlot['equipment'];
};

function isAdminEquipment(value: unknown): value is AdminSlot['equipment'] {
  return ADMIN_EQUIPMENT_VALUES.some((equipment) => equipment === value);
}

function readIssueRequest(): IssueRequest | null {
  const stored = window.sessionStorage.getItem(ADMIN_ISSUE_REQUEST_STORAGE_KEY);
  if (stored === null) return null;

  let value: unknown;
  try {
    value = JSON.parse(stored);
  } catch {
    window.sessionStorage.removeItem(ADMIN_ISSUE_REQUEST_STORAGE_KEY);
    return null;
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const request = value as Record<string, unknown>;
    if (
      typeof request.key === 'string' &&
      request.key.length > 0 &&
      typeof request.slotStartsAt === 'string' &&
      Number.isFinite(Date.parse(request.slotStartsAt)) &&
      isAdminEquipment(request.equipment)
    ) {
      return {
        key: request.key,
        slotStartsAt: request.slotStartsAt,
        equipment: request.equipment,
      };
    }
  }
  window.sessionStorage.removeItem(ADMIN_ISSUE_REQUEST_STORAGE_KEY);
  return null;
}

function storeIssueRequest(request: IssueRequest | null) {
  if (request === null) {
    window.sessionStorage.removeItem(ADMIN_ISSUE_REQUEST_STORAGE_KEY);
  } else {
    window.sessionStorage.setItem(
      ADMIN_ISSUE_REQUEST_STORAGE_KEY,
      JSON.stringify(request),
    );
  }
}

type AdminTicketDetail =
  paths['/api/admin/tickets/{id}']['get']['responses'][200]['content']['application/json'];
export type AdminPrintJob = AdminTicketDetail['printJobs'][number];
export type PrintJobStatus = AdminPrintJob['status'];

export type AdminAction =
  | { type: 'serve' | 'reprint'; ticketId: string }
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
  if (error.code === 'slot_unavailable') {
    return '選択した枠は埋まったか、受付できる時間を過ぎました。最新の空き状況から選び直してください。';
  }
  if (error.code === 'invalid_transition') {
    return 'この整理券は現在の状態では変更できません。最新状態を確認してください。';
  }
  if (error.code === 'idempotency_key_reuse') {
    return '発券内容が一致しません。同じ発券操作を再試行してください。';
  }
  return '操作に失敗しました。最新状態を確認して再試行してください。';
}

export function canReprint(status: PrintJobStatus | undefined) {
  return status === 'printed' || status === 'failed' || status === 'unknown';
}

export function useAdminReservations(
  token: string,
  onUnauthorized: () => void,
) {
  return useQuery({
    queryKey: ['admin', 'reservations'],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET(
        '/api/admin/reservations',
        { headers: adminHeaders(token) },
      );
      assertAdminResponse(response, error, onUnauthorized);
      if (data === undefined) throw new Error('予約枠を取得できませんでした。');
      return data;
    },
    refetchInterval: ADMIN_RESERVATIONS_POLL_INTERVAL,
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
    refetchInterval: enabled ? ADMIN_RESERVATIONS_POLL_INTERVAL : false,
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
        case 'serve': {
          const result = await apiClient.POST(
            '/api/admin/tickets/{id}/serve',
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

export function useRescheduleTicket(token: string, onUnauthorized: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ticketId,
      slotStartsAt,
      equipment,
      comment,
    }: {
      ticketId: string;
      slotStartsAt: string;
      equipment: AdminSlot['equipment'];
      comment?: string;
    }) => {
      const { data, error, response } = await apiClient.POST(
        '/api/admin/tickets/{id}/reschedule',
        {
          params: { path: { id: ticketId } },
          headers: adminHeaders(token),
          body: {
            slotStartsAt,
            equipment,
            ...(comment === undefined ? {} : { comment }),
          },
        },
      );
      assertAdminResponse(response, error, onUnauthorized);
      if (data === undefined)
        throw new Error('予約変更の結果を取得できませんでした。');
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['admin', 'reservations'],
      });
    },
  });
}

export function useIssueTicket(token: string, onUnauthorized: () => void) {
  const queryClient = useQueryClient();
  const retryRequest = useRef<IssueRequest | null>(readIssueRequest());
  const mutation = useMutation({
    mutationFn: async (request: {
      key: string;
      slotStartsAt: string;
      equipment: AdminSlot['equipment'];
    }) => {
      const { data, error, response } = await apiClient.POST(
        '/api/admin/tickets',
        {
          params: { header: { 'idempotency-key': request.key } },
          headers: adminHeaders(token),
          body: {
            slotStartsAt: request.slotStartsAt,
            equipment: request.equipment,
          },
        },
      );
      assertAdminResponse(response, error, onUnauthorized);
      if (data === undefined)
        throw new Error('発券結果を取得できませんでした。');
      return data.ticket;
    },
    onSuccess: async () => {
      storeIssueRequest(null);
      retryRequest.current = null;
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: async (error) => {
      if (error instanceof AdminApiError && error.status === 409) {
        storeIssueRequest(null);
        retryRequest.current = null;
        await queryClient.invalidateQueries({
          queryKey: ['admin', 'reservations'],
        });
      }
    },
  });

  return {
    mutation,
    issue(slot: Pick<AdminSlot, 'startsAt' | 'equipment'>) {
      if (retryRequest.current !== null || mutation.isPending) return;
      const request: IssueRequest = {
        key: crypto.randomUUID(),
        slotStartsAt: slot.startsAt,
        equipment: slot.equipment,
      };
      storeIssueRequest(request);
      retryRequest.current = request;
      mutation.reset();
      mutation.mutate(request);
    },
    hasUnresolvedRequest: retryRequest.current !== null,
    retry() {
      if (retryRequest.current === null || mutation.isPending) return;
      mutation.mutate(retryRequest.current);
    },
  };
}
