import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { ApiError, assertApiOk } from '../../api/api-error.ts';
import { apiClient } from '../../api/client.ts';
import type { paths } from '../../api/schema.ts';
import { isUnknownOutcome, timeoutSignal } from '../agents/agents-api.ts';

export const ADMIN_RESERVATIONS_POLL_INTERVAL = 3_000;

/** URL で選ばれた tenant/event。ブラウザ側の入力ではなくサーバーが認可の正本。 */
export type AdminScope = { tenantSlug: string; eventSlug: string };

export function scopedStorageKey(base: string, scope: AdminScope) {
  return `${base}:${scope.tenantSlug}/${scope.eventSlug}`;
}

/** ログアウト時に、このブラウザタブへ残した操作中の下書き (認可情報ではない) を消す。 */
export function clearAdminDraftStorage() {
  for (const key of Object.keys(window.sessionStorage)) {
    if (key.startsWith('bunkasai-ticket.admin-')) {
      window.sessionStorage.removeItem(key);
    }
  }
}

export type AdminReservations = Awaited<
  ReturnType<typeof fetchAdminReservations>
>;
export type AdminSlot = AdminReservations['slots'][number];
export type AdminTicket =
  | Exclude<AdminSlot['ticket'], null>
  | AdminReservations['legacyTickets'][number]
  | AdminReservations['unconfiguredTickets'][number]
  | AdminReservations['releasedTickets'][number];

export const ADMIN_ISSUE_REQUEST_STORAGE_KEY =
  'bunkasai-ticket.admin-issue-request';

type IssueRequest = {
  key: string;
  slotStartsAt: string;
  equipment: AdminSlot['equipment'];
};

// 機材名はイベント設定で決まる任意文字列。所属の検証はサーバーが行う。
function isAdminEquipment(value: unknown): value is AdminSlot['equipment'] {
  return typeof value === 'string' && value.length > 0;
}

function readIssueRequest(scope: AdminScope): IssueRequest | null {
  const storageKey = scopedStorageKey(ADMIN_ISSUE_REQUEST_STORAGE_KEY, scope);
  const stored = window.sessionStorage.getItem(storageKey);
  if (stored === null) return null;

  let value: unknown;
  try {
    value = JSON.parse(stored);
  } catch {
    window.sessionStorage.removeItem(storageKey);
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
  window.sessionStorage.removeItem(storageKey);
  return null;
}

function storeIssueRequest(scope: AdminScope, request: IssueRequest | null) {
  const storageKey = scopedStorageKey(ADMIN_ISSUE_REQUEST_STORAGE_KEY, scope);
  if (request === null) {
    window.sessionStorage.removeItem(storageKey);
  } else {
    window.sessionStorage.setItem(storageKey, JSON.stringify(request));
  }
}

type AdminTicketDetail =
  paths['/api/v3/t/{tenantSlug}/e/{eventSlug}/tickets/{id}']['get']['responses'][200]['content']['application/json'];
export type AdminPrintJob = AdminTicketDetail['printJobs'][number];
export type PrintJobStatus = AdminPrintJob['status'];

export type AdminRestoreBody =
  paths['/api/v3/t/{tenantSlug}/e/{eventSlug}/tickets/{id}/restore']['post']['requestBody']['content']['application/json'];

export type AdminAction =
  | { type: 'serve' | 'reprint'; ticketId: string }
  | {
      type: 'cancel';
      ticketId: string;
      reason: 'visitor' | 'staff' | 'no_show';
    }
  | { type: 'release'; ticketId: string }
  | {
      type: 'restore' | 'undo-guidance';
      ticketId: string;
      body: AdminRestoreBody;
    };

export const ADMIN_PENDING_TICKET_ACTION_STORAGE_KEY =
  'bunkasai-ticket.admin-pending-action';
export type PendingTicketAction = Extract<
  AdminAction,
  { type: 'release' | 'restore' | 'undo-guidance' }
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRestoreBody(value: unknown): value is AdminRestoreBody {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (keys.length === 0) return true;
  return (
    keys.every((key) =>
      ['slotStartsAt', 'equipment', 'comment'].includes(key),
    ) &&
    typeof value.slotStartsAt === 'string' &&
    Number.isFinite(Date.parse(value.slotStartsAt)) &&
    isAdminEquipment(value.equipment) &&
    (value.comment === undefined ||
      (typeof value.comment === 'string' &&
        Array.from(value.comment).length <= 200 &&
        !Array.from(value.comment).some((character) => {
          const codePoint = character.codePointAt(0) ?? 0;
          return codePoint < 0x20 || codePoint === 0x7f;
        })))
  );
}

export function readPendingTicketAction(
  scope: AdminScope,
): PendingTicketAction | null {
  const storageKey = scopedStorageKey(
    ADMIN_PENDING_TICKET_ACTION_STORAGE_KEY,
    scope,
  );
  const stored = window.sessionStorage.getItem(storageKey);
  if (stored === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(stored);
  } catch {
    window.sessionStorage.removeItem(storageKey);
    return null;
  }
  if (
    isRecord(value) &&
    typeof value.ticketId === 'string' &&
    value.ticketId.length > 0 &&
    value.type === 'release' &&
    Object.keys(value).every((key) => ['type', 'ticketId'].includes(key))
  ) {
    return { type: 'release', ticketId: value.ticketId };
  }
  if (
    isRecord(value) &&
    typeof value.ticketId === 'string' &&
    value.ticketId.length > 0 &&
    (value.type === 'restore' || value.type === 'undo-guidance') &&
    Object.keys(value).every((key) =>
      ['type', 'ticketId', 'body'].includes(key),
    ) &&
    isRestoreBody(value.body)
  ) {
    return {
      type: value.type,
      ticketId: value.ticketId,
      body: value.body,
    };
  }
  window.sessionStorage.removeItem(storageKey);
  return null;
}

export function storePendingTicketAction(
  scope: AdminScope,
  action: PendingTicketAction | null,
) {
  const storageKey = scopedStorageKey(
    ADMIN_PENDING_TICKET_ACTION_STORAGE_KEY,
    scope,
  );
  if (action === null) {
    window.sessionStorage.removeItem(storageKey);
  } else {
    window.sessionStorage.setItem(storageKey, JSON.stringify(action));
  }
}

/** 別枠を指定した操作が 409 になったときの固定文言 (理由は区別せず中立に示す)。 */
export const DIFFERENT_SLOT_CONFLICT_MESSAGE = '選んだ枠は利用できません';

export function adminErrorMessage(
  error: unknown,
  options: { differentSlot?: boolean; reprint?: boolean } = {},
) {
  if (options.reprint === true && isUnknownOutcome(error)) {
    return '再印刷の結果が不明です。自動では再印刷しません。用紙と印刷履歴を確認してから、必要な場合だけ手動で再印刷してください。';
  }
  if (
    options.differentSlot === true &&
    error instanceof ApiError &&
    error.status === 409
  ) {
    return DIFFERENT_SLOT_CONFLICT_MESSAGE;
  }
  if (!(error instanceof ApiError)) {
    return '通信に失敗しました。ネットワークを確認して再試行してください。';
  }
  if (error.status === 401) {
    return 'ログインの有効期限が切れました。再ログインしてください。';
  }
  if (error.code === 'csrf_failed' || error.code === 'csrf_unavailable') {
    return '送信元の確認に失敗しました。ページを再読み込みして再試行してください。';
  }
  if (error.status === 403) {
    return 'この操作を行う権限がありません。';
  }
  if (error.status === 404) {
    return '対象のテナント、イベント、または整理券が見つかりません。';
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

async function fetchAdminReservations(scope: AdminScope, signal: AbortSignal) {
  const { data, error, response } = await apiClient.GET(
    '/api/v3/t/{tenantSlug}/e/{eventSlug}/reservations',
    { params: { path: scope }, signal },
  );
  assertApiOk(response, error);
  if (data === undefined) throw new Error('予約枠を取得できませんでした。');
  return data;
}

export function useAdminReservations(scope: AdminScope) {
  return useQuery({
    queryKey: ['admin', scope.tenantSlug, scope.eventSlug, 'reservations'],
    queryFn: ({ signal }) => fetchAdminReservations(scope, signal),
    // 認証/認可/存在エラーは再試行しても変わらないので、ポーリングを止める。
    refetchInterval: (query) => {
      const error = query.state.error;
      return error instanceof ApiError &&
        (error.status === 401 || error.status === 403 || error.status === 404)
        ? false
        : ADMIN_RESERVATIONS_POLL_INTERVAL;
    },
  });
}

export function useAdminTicketDetail(
  scope: AdminScope,
  ticketId: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['admin', scope.tenantSlug, scope.eventSlug, 'ticket', ticketId],
    enabled,
    queryFn: async ({ signal }) => {
      const { data, error, response } = await apiClient.GET(
        '/api/v3/t/{tenantSlug}/e/{eventSlug}/tickets/{id}',
        {
          params: { path: { ...scope, id: ticketId } },
          signal,
        },
      );
      assertApiOk(response, error);
      if (data === undefined)
        throw new Error('印刷履歴を取得できませんでした。');
      return data;
    },
    refetchInterval: enabled ? ADMIN_RESERVATIONS_POLL_INTERVAL : false,
  });
}

export function useAdminAction(scope: AdminScope) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action: AdminAction) => {
      const options = {
        params: { path: { ...scope, id: action.ticketId } },
      };
      switch (action.type) {
        case 'serve': {
          const result = await apiClient.POST(
            '/api/v3/t/{tenantSlug}/e/{eventSlug}/tickets/{id}/serve',
            options,
          );
          assertApiOk(result.response, result.error);
          break;
        }

        case 'cancel': {
          const result = await apiClient.POST(
            '/api/v3/t/{tenantSlug}/e/{eventSlug}/tickets/{id}/cancel',
            { ...options, body: { reason: action.reason } },
          );
          assertApiOk(result.response, result.error);
          break;
        }
        case 'reprint': {
          const result = await apiClient.POST(
            '/api/v3/t/{tenantSlug}/e/{eventSlug}/tickets/{id}/reprint',
            // 結果不明 (タイムアウト/通信断) でも自動再送しない。再印刷は手動操作のみ。
            { ...options, signal: timeoutSignal(15_000) },
          );
          assertApiOk(result.response, result.error);
          break;
        }
        case 'release': {
          const result = await apiClient.POST(
            '/api/v3/t/{tenantSlug}/e/{eventSlug}/tickets/{id}/release',
            { ...options, body: {} },
          );
          assertApiOk(result.response, result.error);
          if (result.data === undefined)
            throw new Error('枠解放の結果を取得できませんでした。');
          return result.data;
        }
        case 'restore': {
          const result = await apiClient.POST(
            '/api/v3/t/{tenantSlug}/e/{eventSlug}/tickets/{id}/restore',
            { ...options, body: action.body },
          );
          assertApiOk(result.response, result.error);
          if (result.data === undefined)
            throw new Error('整理券の復元結果を取得できませんでした。');
          return result.data;
        }
        case 'undo-guidance': {
          const result = await apiClient.POST(
            '/api/v3/t/{tenantSlug}/e/{eventSlug}/tickets/{id}/undo-guidance',
            { ...options, body: action.body },
          );
          assertApiOk(result.response, result.error);
          if (result.data === undefined)
            throw new Error('案内取消の結果を取得できませんでした。');
          return result.data;
        }
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['admin', scope.tenantSlug, scope.eventSlug],
      });
    },
    onError: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['admin', scope.tenantSlug, scope.eventSlug],
      });
    },
  });
}

export function useRescheduleTicket(scope: AdminScope) {
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
        '/api/v3/t/{tenantSlug}/e/{eventSlug}/tickets/{id}/reschedule',
        {
          params: { path: { ...scope, id: ticketId } },
          body: {
            slotStartsAt,
            equipment,
            ...(comment === undefined ? {} : { comment }),
          },
        },
      );
      assertApiOk(response, error);
      if (data === undefined)
        throw new Error('予約変更の結果を取得できませんでした。');
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['admin', scope.tenantSlug, scope.eventSlug],
      });
    },
    onError: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['admin', scope.tenantSlug, scope.eventSlug, 'reservations'],
      });
    },
  });
}

export function useIssueTicket(scope: AdminScope) {
  const queryClient = useQueryClient();
  const retryRequest = useRef<IssueRequest | null>(readIssueRequest(scope));
  const mutation = useMutation({
    mutationFn: async (request: {
      key: string;
      slotStartsAt: string;
      equipment: AdminSlot['equipment'];
    }) => {
      const { data, error, response } = await apiClient.POST(
        '/api/v3/t/{tenantSlug}/e/{eventSlug}/tickets',
        {
          params: {
            path: scope,
            header: { 'idempotency-key': request.key },
          },
          body: {
            slotStartsAt: request.slotStartsAt,
            equipment: request.equipment,
          },
        },
      );
      assertApiOk(response, error);
      if (data === undefined)
        throw new Error('発券結果を取得できませんでした。');
      return data.ticket;
    },
    onSuccess: async () => {
      storeIssueRequest(scope, null);
      retryRequest.current = null;
      await queryClient.invalidateQueries({
        queryKey: ['admin', scope.tenantSlug, scope.eventSlug],
      });
    },
    onError: async (error) => {
      if (error instanceof ApiError && error.status === 409) {
        storeIssueRequest(scope, null);
        retryRequest.current = null;
        await queryClient.invalidateQueries({
          queryKey: [
            'admin',
            scope.tenantSlug,
            scope.eventSlug,
            'reservations',
          ],
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
      storeIssueRequest(scope, request);
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
