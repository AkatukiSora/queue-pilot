import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Printer, Ticket } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../api/api-error.ts';
import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent } from '../../components/ui/card.tsx';
import {
  createEventTime,
  type EventTime,
  EventTimeProvider,
  UNKNOWN_EVENT_TIME_ZONE,
  useEventTime,
} from '../event-time.tsx';
import {
  type AdminAction,
  type AdminPrintJob,
  type AdminReservations,
  type AdminRestoreBody,
  type AdminScope,
  type AdminSlot,
  type AdminTicket,
  adminErrorMessage,
  canReprint,
  clearAdminDraftStorage,
  type PendingTicketAction,
  type PrintJobStatus,
  readPendingTicketAction,
  scopedStorageKey,
  storePendingTicketAction,
  useAdminAction,
  useAdminReservations,
  useAdminTicketDetail,
  useIssueTicket,
  useRescheduleTicket,
} from './admin-api.ts';
import { categorizeAdminTickets } from './admin-categories.ts';
import { equipmentColumnsOf } from './admin-layout.ts';

const ticketStatusLabels = {
  waiting: '予約済み',
  called: '呼出中（旧券）',
  served: '案内済み',
  cancelled: '取消済み',
} as const;

const cancelReasonLabels = {
  visitor: '来場者都合',
  staff: 'スタッフ都合',
  no_show: '不在',
} as const;

const printStatusLabels: Record<PrintJobStatus, string> = {
  queued: '印刷待ち',
  printing: '印刷中',
  printed: '印刷済み',
  failed: '印刷失敗',
  unknown: '印刷結果不明',
};

function isMidSlot(
  slot: Pick<AdminSlot, 'startsAt' | 'experienceEndsAt'>,
  now: number,
) {
  return (
    Date.parse(slot.startsAt) <= now && now < Date.parse(slot.experienceEndsAt)
  );
}

function confirmMidSlotUse(
  eventTime: EventTime,
  slot: Pick<AdminSlot, 'startsAt' | 'experienceEndsAt'>,
  action: string,
  alreadyConfirmed = false,
) {
  if (alreadyConfirmed || !isMidSlot(slot, Date.now())) return true;
  return window.confirm(
    `途中枠です。体験時間は${eventTime.time(slot.experienceEndsAt)}に終了し、延長されません。${action}を続けますか？`,
  );
}

function slotKey(slot: Pick<AdminSlot, 'startsAt' | 'equipment'>) {
  return `${slot.startsAt}|${slot.equipment}`;
}

function reservationLabel(
  eventTime: EventTime,
  reservation: AdminTicket['reservation'],
) {
  if (reservation.kind === 'legacy') return '時間未割当の旧整理券';
  return `${eventTime.date(reservation.slotStartsAt)} ${eventTime.time(reservation.slotStartsAt)}〜${eventTime.time(reservation.experienceEndsAt)}・${reservation.equipment}`;
}

function isSlotReleased(ticket: AdminTicket) {
  return (
    'slotReleasedAt' in ticket && typeof ticket.slotReleasedAt === 'string'
  );
}

function ticketStatusLabel(ticket: AdminTicket) {
  return ticket.status === 'cancelled' && ticket.cancelReason !== null
    ? `${ticketStatusLabels[ticket.status]}（${cancelReasonLabels[ticket.cancelReason]}）`
    : ticketStatusLabels[ticket.status];
}

type PendingMoveRequest = {
  ticketId: string;
  from: AdminTicket['reservation'];
  slotStartsAt: string;
  equipment: AdminSlot['equipment'];
  comment?: string;
};

const PENDING_MOVE_STORAGE_KEY = 'bunkasai-ticket.admin-pending-move';
const MOVE_NOTICES_STORAGE_KEY = 'bunkasai-ticket.admin-move-notices';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readSessionJson(key: string): unknown {
  const stored = window.sessionStorage.getItem(key);
  if (stored === null) return null;
  try {
    return JSON.parse(stored);
  } catch {
    window.sessionStorage.removeItem(key);
    return null;
  }
}

function isValidDateString(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isReservation(value: unknown): value is AdminTicket['reservation'] {
  if (!isRecord(value)) return false;
  if (value.kind === 'legacy') return true;
  return (
    value.kind === 'slot' &&
    isValidDateString(value.slotStartsAt) &&
    typeof value.equipment === 'string' &&
    value.equipment.length > 0 &&
    isValidDateString(value.experienceEndsAt) &&
    isValidDateString(value.endsAt)
  );
}

function isPendingMoveRequest(value: unknown): value is PendingMoveRequest {
  if (!isRecord(value)) return false;
  return (
    typeof value.ticketId === 'string' &&
    value.ticketId.length > 0 &&
    isReservation(value.from) &&
    isValidDateString(value.slotStartsAt) &&
    typeof value.equipment === 'string' &&
    value.equipment.length > 0 &&
    (value.comment === undefined || typeof value.comment === 'string')
  );
}

function readPendingMoveRequest(scope: AdminScope): PendingMoveRequest | null {
  const key = scopedStorageKey(PENDING_MOVE_STORAGE_KEY, scope);
  const value = readSessionJson(key);
  if (isPendingMoveRequest(value)) return value;
  if (value !== null) window.sessionStorage.removeItem(key);
  return null;
}

function storePendingMoveRequest(
  scope: AdminScope,
  request: PendingMoveRequest | null,
) {
  const key = scopedStorageKey(PENDING_MOVE_STORAGE_KEY, scope);
  if (request === null) {
    window.sessionStorage.removeItem(key);
  } else {
    window.sessionStorage.setItem(key, JSON.stringify(request));
  }
}

function readMoveNotices(scope: AdminScope): Record<string, boolean> {
  const key = scopedStorageKey(MOVE_NOTICES_STORAGE_KEY, scope);
  const value = readSessionJson(key);
  if (!isRecord(value)) {
    if (value !== null) window.sessionStorage.removeItem(key);
    return {};
  }
  const notices: Record<string, boolean> = {};
  for (const [ticketId, needsReprint] of Object.entries(value)) {
    if (needsReprint === true) notices[ticketId] = true;
  }
  return notices;
}

function storeMoveNotices(scope: AdminScope, notices: Record<string, boolean>) {
  const key = scopedStorageKey(MOVE_NOTICES_STORAGE_KEY, scope);
  const unresolved = Object.fromEntries(
    Object.entries(notices).filter(([, needsReprint]) => needsReprint),
  );
  if (Object.keys(unresolved).length === 0) {
    window.sessionStorage.removeItem(key);
  } else {
    window.sessionStorage.setItem(key, JSON.stringify(unresolved));
  }
}

export function AdminScreen({
  tenantSlug,
  eventSlug,
  onLogout,
}: AdminScope & { onLogout?: () => Promise<void> }) {
  return (
    <AdminDashboard scope={{ tenantSlug, eventSlug }} onLogout={onLogout} />
  );
}

function AdminDashboard({
  scope: routeScope,
  onLogout,
}: {
  scope: AdminScope;
  onLogout?: () => Promise<void>;
}) {
  const [logoutFailed, setLogoutFailed] = useState(false);
  // URL 由来の slug が同じなら同一の参照を使い、query key / storage key を安定させる。
  const scope = useMemo(
    () => ({
      tenantSlug: routeScope.tenantSlug,
      eventSlug: routeScope.eventSlug,
    }),
    [routeScope.tenantSlug, routeScope.eventSlug],
  );
  const queryClient = useQueryClient();
  const reservations = useAdminReservations(scope);
  const eventTime = useMemo(
    () =>
      createEventTime(reservations.data?.timeZone ?? UNKNOWN_EVENT_TIME_ZONE),
    [reservations.data?.timeZone],
  );
  const action = useAdminAction(scope);
  const issue = useIssueTicket(scope);
  const reschedule = useRescheduleTicket(scope);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);
  const [selectedDate, setSelectedDate] = useState('');
  const [pendingMove, setPendingMove] = useState<PendingMoveRequest | null>(
    () => readPendingMoveRequest(scope),
  );
  const [pendingTicketAction, setPendingTicketAction] =
    useState<PendingTicketAction | null>(() => readPendingTicketAction(scope));
  const [openRestoreTicketId, setOpenRestoreTicketId] = useState<string | null>(
    () =>
      pendingTicketAction?.type === 'restore' ||
      pendingTicketAction?.type === 'undo-guidance'
        ? pendingTicketAction.ticketId
        : null,
  );
  const [restoreConflictTicketId, setRestoreConflictTicketId] = useState<
    string | null
  >(null);
  const [moveNotices, setMoveNotices] = useState(() => readMoveNotices(scope));
  const [openMoveTicketId, setOpenMoveTicketId] = useState<string | null>(
    () => pendingMove?.ticketId ?? null,
  );
  const conflictingMutationPending =
    action.isPending ||
    pendingTicketAction !== null ||
    issue.mutation.isPending ||
    issue.hasUnresolvedRequest ||
    reschedule.isPending;
  const operationBlocked = conflictingMutationPending || pendingMove !== null;
  const updatePendingMove = (request: PendingMoveRequest | null) => {
    storePendingMoveRequest(scope, request);
    setPendingMove(request);
  };
  const updateMoveNotices = (notices: Record<string, boolean>) => {
    storeMoveNotices(scope, notices);
    setMoveNotices(notices);
  };
  const sendAction = (nextAction: AdminAction) => {
    action.mutate(nextAction, {
      onSuccess: (result) => {
        if (
          nextAction.type === 'release' ||
          nextAction.type === 'restore' ||
          nextAction.type === 'undo-guidance'
        ) {
          storePendingTicketAction(scope, null);
          setPendingTicketAction(null);
        }
        if (nextAction.type === 'reprint') {
          const next = { ...moveNotices };
          delete next[nextAction.ticketId];
          updateMoveNotices(next);
        }
        if (
          (nextAction.type === 'restore' ||
            nextAction.type === 'undo-guidance') &&
          result !== undefined &&
          'reprintRequired' in result &&
          result.reprintRequired
        ) {
          updateMoveNotices({ ...moveNotices, [nextAction.ticketId]: true });
        }
        if (
          nextAction.type === 'release' ||
          nextAction.type === 'restore' ||
          nextAction.type === 'undo-guidance'
        ) {
          setOpenRestoreTicketId(null);
          setRestoreConflictTicketId(null);
        }
      },
      onError: (error) => {
        if (
          (nextAction.type === 'release' ||
            nextAction.type === 'restore' ||
            nextAction.type === 'undo-guidance') &&
          error instanceof ApiError &&
          error.status !== undefined &&
          error.status >= 400 &&
          error.status < 500
        ) {
          storePendingTicketAction(scope, null);
          setPendingTicketAction(null);
        }
        if (
          (nextAction.type === 'restore' ||
            nextAction.type === 'undo-guidance') &&
          error instanceof ApiError &&
          error.status === 409 &&
          error.code === 'slot_unavailable'
        ) {
          setOpenRestoreTicketId(nextAction.ticketId);
          // 元の枠の競合だけを案内する。別枠の失敗は中立な固定文言のみ表示する。
          setRestoreConflictTicketId(
            nextAction.body.slotStartsAt === undefined
              ? nextAction.ticketId
              : null,
          );
        }
      },
    });
  };
  const runAction = (nextAction: AdminAction) => {
    if (operationBlocked) return;
    if (
      nextAction.type === 'release' ||
      nextAction.type === 'restore' ||
      nextAction.type === 'undo-guidance'
    ) {
      storePendingTicketAction(scope, nextAction);
      setPendingTicketAction(nextAction);
    }
    sendAction(nextAction);
  };
  const retryPendingTicketAction = () => {
    if (pendingTicketAction === null || action.isPending) return;
    if (pendingTicketAction.type !== 'release') {
      const data = reservations.data;
      if (data === undefined) {
        void reservations.refetch();
        return;
      }
      const ticket = [
        ...data.slots.flatMap(({ ticket }) =>
          ticket === null ? [] : [ticket],
        ),
        ...data.legacyTickets,
        ...data.unconfiguredTickets,
        ...data.releasedTickets,
        ...data.printNeedsAttention.map(({ ticket }) => ticket),
      ].find((candidate) => candidate.id === pendingTicketAction.ticketId);
      if (ticket === undefined) {
        void reservations.refetch();
        return;
      }
      const target =
        pendingTicketAction.body.slotStartsAt !== undefined &&
        pendingTicketAction.body.equipment !== undefined
          ? data.slots.find(
              (slot) =>
                slot.startsAt === pendingTicketAction.body.slotStartsAt &&
                slot.equipment === pendingTicketAction.body.equipment,
            )
          : ticket.reservation.kind === 'slot'
            ? {
                startsAt: ticket.reservation.slotStartsAt,
                experienceEndsAt: ticket.reservation.experienceEndsAt,
              }
            : undefined;
      if (
        (pendingTicketAction.body.slotStartsAt !== undefined &&
          target === undefined) ||
        (target !== undefined &&
          !confirmMidSlotUse(eventTime, target, '同じ操作の再試行'))
      ) {
        return;
      }
    }
    sendAction(pendingTicketAction);
  };
  const sendMove = (request: PendingMoveRequest) => {
    reschedule.mutate(
      {
        ticketId: request.ticketId,
        slotStartsAt: request.slotStartsAt,
        equipment: request.equipment,
        ...(request.comment === undefined ? {} : { comment: request.comment }),
      },
      {
        onSuccess: (result) => {
          updatePendingMove(null);
          setOpenMoveTicketId(null);
          const needsReprint =
            result.reprintRequired ||
            request.from.kind === 'legacy' ||
            (request.from.kind === 'slot' &&
              request.from.slotStartsAt !== request.slotStartsAt);
          updateMoveNotices({
            ...moveNotices,
            [request.ticketId]:
              moveNotices[request.ticketId] === true || needsReprint,
          });
        },
        onError: (error) => {
          if (
            error instanceof ApiError &&
            error.status !== undefined &&
            error.status >= 400 &&
            error.status < 500
          ) {
            updatePendingMove(null);
          }
        },
      },
    );
  };
  const submitMove = (request: PendingMoveRequest) => {
    if (operationBlocked) return;
    updatePendingMove(request);
    sendMove(request);
  };
  const retryMove = () => {
    if (pendingMove === null || conflictingMutationPending) return;
    sendMove(pendingMove);
  };
  const toggleMove = (ticketId: string) => {
    setOpenMoveTicketId((current) => (current === ticketId ? null : ticketId));
  };
  const toggleRestore = (ticketId: string) => {
    setOpenRestoreTicketId((current) =>
      current === ticketId ? null : ticketId,
    );
    setRestoreConflictTicketId((current) =>
      current === ticketId ? null : current,
    );
  };
  const dates = [
    ...new Set(
      reservations.data?.slots.map((slot) => eventTime.date(slot.startsAt)) ??
        [],
    ),
  ].sort();
  const today = eventTime.date(new Date(now).toISOString());
  const initialDate =
    (dates.includes(today) ? today : undefined) ??
    dates.find((date) => date > today) ??
    dates.at(-1);
  const activeDate = dates.includes(selectedDate) ? selectedDate : initialDate;
  const categories =
    reservations.data === undefined
      ? undefined
      : categorizeAdminTickets(reservations.data, now);
  const unconfiguredTicketIds = new Set(
    reservations.data?.unconfiguredTickets.map((ticket) => ticket.id) ?? [],
  );
  const revealTicket = (ticketId: string) => {
    const card = window.document.getElementById(`ticket-${ticketId}`);
    const details = card?.closest('details');
    if (details instanceof HTMLDetailsElement) details.open = true;
    window.requestAnimationFrame(() => card?.focus());
  };

  return (
    <EventTimeProvider value={eventTime}>
      <main className="mx-auto grid min-h-screen w-full max-w-7xl content-start gap-5 px-4 py-6 sm:px-6 sm:py-10">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-primary">文化祭 整理券</p>
            <h1 className="text-3xl font-bold tracking-tight">管理画面</h1>
          </div>
          {onLogout !== undefined && (
            <Button
              variant="outline"
              onClick={() => {
                setLogoutFailed(false);
                onLogout().then(clearAdminDraftStorage, () =>
                  setLogoutFailed(true),
                );
              }}
            >
              ログアウト
            </Button>
          )}
        </header>

        {logoutFailed && (
          <p role="alert" className="text-sm text-destructive">
            ログアウトに失敗しました。もう一度お試しください。
          </p>
        )}

        {action.isError && (
          <div
            className="grid gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-base"
            role="alert"
          >
            <p>
              {adminErrorMessage(action.error, {
                reprint: action.variables?.type === 'reprint',
                differentSlot:
                  (action.variables?.type === 'restore' ||
                    action.variables?.type === 'undo-guidance') &&
                  action.variables.body.slotStartsAt !== undefined,
              })}
            </p>
            {action.error instanceof ApiError &&
              action.error.status === 409 && (
                <Button
                  className="w-fit"
                  variant="outline"
                  onClick={() =>
                    void queryClient.invalidateQueries({ queryKey: ['admin'] })
                  }
                >
                  予約情報を再読み込み
                </Button>
              )}
          </div>
        )}

        {(issue.mutation.isError || issue.hasUnresolvedRequest) && (
          <div
            className="rounded-lg border border-destructive/40 bg-destructive/5 p-4"
            role="alert"
          >
            <p>
              {issue.mutation.isPending
                ? '発券中です。応答が確認できるまで同じ操作だけを使用してください。'
                : issue.mutation.isError
                  ? adminErrorMessage(issue.mutation.error)
                  : '前回の発券結果を確認できていません。同じ枠・同じ内容で再試行してください。'}
            </p>
            {issue.hasUnresolvedRequest && (
              <Button
                className="mt-3"
                variant="outline"
                onClick={issue.retry}
                disabled={issue.mutation.isPending}
              >
                同じ枠・同じ内容で再試行
              </Button>
            )}
          </div>
        )}

        {pendingMove !== null && (
          <div
            className="grid gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
            role="alert"
          >
            <p>
              移動結果を確認できていません。別の予約操作は行わず、同じ内容を再送してください。
            </p>
            <p>変更前: {reservationLabel(eventTime, pendingMove.from)}</p>
            <p>
              変更先: {eventTime.date(pendingMove.slotStartsAt)}{' '}
              {eventTime.time(pendingMove.slotStartsAt)}・
              {pendingMove.equipment}
            </p>
            {pendingMove.comment !== undefined && (
              <p>来場者へのコメント: {pendingMove.comment}</p>
            )}
            {reschedule.isError && (
              <p>
                {adminErrorMessage(reschedule.error, { differentSlot: true })}
              </p>
            )}
            <Button
              className="w-fit"
              variant="outline"
              disabled={conflictingMutationPending}
              onClick={retryMove}
            >
              {reschedule.isPending ? '移動中…' : '同じ移動内容で再試行'}
            </Button>
          </div>
        )}
        {pendingTicketAction !== null && (
          <div
            className="grid gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
            role="alert"
          >
            <p>
              {pendingTicketAction.type === 'release'
                ? '枠解放'
                : pendingTicketAction.type === 'restore'
                  ? 'キャンセルの復元'
                  : '案内・入店の取消'}
              の結果を確認できていません。別の予約操作は行わず、同じ要求だけ再送してください。
            </p>
            <p className="text-sm">
              別端末で状態が変更された可能性があります。最新状態を確認してから再試行してください。
            </p>
            <Button
              className="w-fit"
              variant="outline"
              disabled={action.isPending}
              onClick={retryPendingTicketAction}
            >
              {action.isPending ? '再送中…' : '同じ操作を再試行'}
            </Button>
          </div>
        )}
        {reschedule.isError && pendingMove === null && (
          <p role="alert">
            {adminErrorMessage(reschedule.error, { differentSlot: true })}
          </p>
        )}

        {issue.mutation.isSuccess && issue.mutation.data !== undefined && (
          <p
            className="rounded-lg border bg-primary/5 p-4 text-lg font-semibold"
            role="status"
          >
            {issue.mutation.data.number}番を発券しました。
            {issue.mutation.data.reservation.kind === 'slot' && (
              <span className="mt-1 block text-base font-medium">
                {eventTime.date(issue.mutation.data.reservation.slotStartsAt)}{' '}
                {eventTime.time(issue.mutation.data.reservation.slotStartsAt)}・
                {issue.mutation.data.reservation.equipment}
              </span>
            )}
          </p>
        )}

        {reservations.isPending && (
          <p aria-busy="true">予約枠を読み込んでいます…</p>
        )}
        {reservations.isError && (
          <Card>
            <CardContent className="grid gap-3 p-5">
              <p role="alert">{adminErrorMessage(reservations.error)}</p>
              <Button
                className="w-full sm:w-auto"
                onClick={() => void reservations.refetch()}
              >
                再読み込み
              </Button>
            </CardContent>
          </Card>
        )}

        {reservations.data !== undefined && (
          <>
            <section
              className="grid gap-3"
              aria-labelledby="reservation-board-title"
            >
              <div className="flex items-center gap-2">
                <Ticket className="size-5" aria-hidden="true" />
                <h2 className="text-xl font-bold" id="reservation-board-title">
                  予約枠
                </h2>
              </div>
              <nav className="flex flex-wrap gap-2" aria-label="日付">
                {dates.map((date) => (
                  <Button
                    key={date}
                    variant={date === activeDate ? 'default' : 'outline'}
                    aria-pressed={date === activeDate}
                    onClick={() => setSelectedDate(date)}
                  >
                    {date}
                  </Button>
                ))}
              </nav>
              {activeDate === undefined ? (
                <Card>
                  <CardContent className="p-5 text-muted-foreground">
                    設定された予約枠はありません。
                  </CardContent>
                </Card>
              ) : (
                <ReservationBoard
                  date={activeDate}
                  slots={reservations.data.slots}
                  now={now}
                  onTicketNavigate={revealTicket}
                  onIssue={(slot) => {
                    if (operationBlocked) return;
                    issue.issue(slot);
                  }}
                  issuePending={operationBlocked}
                />
              )}
              <p
                className="text-center text-sm text-muted-foreground"
                aria-live="polite"
              >
                空き枠を選ぶと発券します。予約状況は3秒ごとに更新されます。
                {reservations.isFetching && ' 更新中…'}
              </p>
            </section>

            <TicketSection
              title="これから利用・対応待ち"
              tickets={categories?.active ?? []}
              slots={reservations.data.slots}
              scope={scope}
              onAction={runAction}
              actionPending={conflictingMutationPending}
              pendingMove={pendingMove}
              moveNotices={moveNotices}
              movePending={conflictingMutationPending}
              openMoveTicketId={openMoveTicketId}
              onToggleMove={toggleMove}
              onMoveSubmit={submitMove}
              onMoveRetry={retryMove}
              unconfiguredTicketIds={unconfiguredTicketIds}
              now={now}
              openRestoreTicketId={openRestoreTicketId}
              onToggleRestore={toggleRestore}
              restoreConflictTicketId={restoreConflictTicketId}
            />

            <TicketSection
              collapsed
              title="キャンセル済み"
              tickets={categories?.cancelled ?? []}
              slots={reservations.data.slots}
              scope={scope}
              onAction={runAction}
              actionPending={conflictingMutationPending}
              pendingMove={pendingMove}
              moveNotices={moveNotices}
              movePending={conflictingMutationPending}
              openMoveTicketId={openMoveTicketId}
              onToggleMove={toggleMove}
              onMoveSubmit={submitMove}
              onMoveRetry={retryMove}
              unconfiguredTicketIds={unconfiguredTicketIds}
              now={now}
              openRestoreTicketId={openRestoreTicketId}
              onToggleRestore={toggleRestore}
              restoreConflictTicketId={restoreConflictTicketId}
            />
            <TicketSection
              collapsed
              title="案内・入店済み"
              tickets={categories?.served ?? []}
              slots={reservations.data.slots}
              scope={scope}
              onAction={runAction}
              actionPending={conflictingMutationPending}
              pendingMove={pendingMove}
              moveNotices={moveNotices}
              movePending={conflictingMutationPending}
              openMoveTicketId={openMoveTicketId}
              onToggleMove={toggleMove}
              onMoveSubmit={submitMove}
              onMoveRetry={retryMove}
              unconfiguredTicketIds={unconfiguredTicketIds}
              now={now}
              openRestoreTicketId={openRestoreTicketId}
              onToggleRestore={toggleRestore}
              restoreConflictTicketId={restoreConflictTicketId}
            />
            <TicketSection
              collapsed
              title="過去枠"
              tickets={categories?.past ?? []}
              slots={reservations.data.slots}
              scope={scope}
              onAction={runAction}
              actionPending={conflictingMutationPending}
              pendingMove={pendingMove}
              moveNotices={moveNotices}
              movePending={conflictingMutationPending}
              openMoveTicketId={openMoveTicketId}
              onToggleMove={toggleMove}
              onMoveSubmit={submitMove}
              onMoveRetry={retryMove}
              unconfiguredTicketIds={unconfiguredTicketIds}
              now={now}
              openRestoreTicketId={openRestoreTicketId}
              onToggleRestore={toggleRestore}
              restoreConflictTicketId={restoreConflictTicketId}
            />
            <PrintAttentionSection
              items={reservations.data.printNeedsAttention}
              actionPending={operationBlocked}
              onOpenTicket={revealTicket}
              onReprint={(ticketId) => runAction({ type: 'reprint', ticketId })}
            />
          </>
        )}
      </main>
    </EventTimeProvider>
  );
}

function ReservationBoard({
  date,
  slots,
  now,
  onTicketNavigate,
  onIssue,
  issuePending,
}: {
  date: string;
  slots: AdminReservations['slots'];
  now: number;
  onTicketNavigate: (ticketId: string) => void;
  onIssue: (slot: AdminSlot) => void;
  issuePending: boolean;
}) {
  const eventTime = useEventTime();
  const equipmentColumns = equipmentColumnsOf(slots);
  const daySlots = slots.filter(
    (slot) => eventTime.date(slot.startsAt) === date,
  );
  const rows = [
    ...new Set(daySlots.map((slot) => eventTime.time(slot.startsAt))),
  ].sort();
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table
        className="w-full border-collapse text-left"
        style={{ minWidth: `${8 + equipmentColumns.length * 11}rem` }}
      >
        <caption className="sr-only">{date}の時間枠と機材別予約状況</caption>
        <thead className="bg-muted/60">
          <tr>
            <th className="p-3">開始時刻</th>
            {equipmentColumns.map((equipment) => (
              <th className="p-3" key={equipment} scope="col">
                {equipment}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((time) => (
            <tr className="border-t" key={time}>
              <th className="whitespace-nowrap p-3 tabular-nums" scope="row">
                {time}
              </th>
              {equipmentColumns.map((equipment) => {
                const slot = daySlots.find(
                  (candidate) =>
                    eventTime.time(candidate.startsAt) === time &&
                    candidate.equipment === equipment,
                );
                if (slot === undefined) {
                  return (
                    <td
                      className="p-3 text-sm text-muted-foreground"
                      key={equipment}
                    >
                      未設定
                    </td>
                  );
                }
                const ticket = slot.ticket;
                if (ticket !== null) {
                  return (
                    <td className="p-3" key={equipment}>
                      <a
                        className="font-semibold underline underline-offset-2"
                        href={`#ticket-${ticket.id}`}
                        onClick={() => onTicketNavigate(ticket.id)}
                      >
                        {ticket.number}番・{ticketStatusLabel(ticket)}
                      </a>
                    </td>
                  );
                }
                return (
                  <td className="p-3" key={equipment}>
                    {slot.bookable ? (
                      <div className="grid justify-items-start gap-1">
                        {isMidSlot(slot, now) && (
                          <p className="text-xs font-semibold text-destructive">
                            途中枠・体験終了
                            {eventTime.time(slot.experienceEndsAt)}まで
                          </p>
                        )}
                        <Button
                          size="sm"
                          disabled={issuePending}
                          onClick={() => {
                            if (!confirmMidSlotUse(eventTime, slot, '発券'))
                              return;
                            onIssue(slot);
                          }}
                        >
                          空き・発券
                        </Button>
                      </div>
                    ) : (
                      <Badge variant="outline">経過</Badge>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TicketSection({
  collapsed = false,
  title,
  tickets,
  slots,
  scope,
  onAction,
  actionPending,
  pendingMove,
  moveNotices,
  movePending,
  openMoveTicketId,
  onToggleMove,
  onMoveSubmit,
  onMoveRetry,
  unconfiguredTicketIds,
  now,
  openRestoreTicketId,
  onToggleRestore,
  restoreConflictTicketId,
}: {
  collapsed?: boolean;
  title: string;
  tickets: AdminTicket[];
  slots: AdminReservations['slots'];
  scope: AdminScope;
  onAction: (action: AdminAction) => void;
  actionPending: boolean;
  pendingMove: PendingMoveRequest | null;
  moveNotices: Record<string, boolean>;
  movePending: boolean;
  openMoveTicketId: string | null;
  onToggleMove: (ticketId: string) => void;
  onMoveSubmit: (request: PendingMoveRequest) => void;
  onMoveRetry: () => void;
  unconfiguredTicketIds: Set<string>;
  now: number;
  openRestoreTicketId: string | null;
  onToggleRestore: (ticketId: string) => void;
  restoreConflictTicketId: string | null;
}) {
  const content =
    tickets.length === 0 ? (
      <Card>
        <CardContent className="p-5 text-muted-foreground">
          対象の整理券はありません。
        </CardContent>
      </Card>
    ) : (
      tickets.map((ticket) => (
        <AdminTicketCard
          actionPending={actionPending}
          key={ticket.id}
          moveNotice={moveNotices[ticket.id] ?? null}
          movePending={movePending}
          onAction={onAction}
          onMoveRetry={onMoveRetry}
          onMoveSubmit={onMoveSubmit}
          onToggleMove={onToggleMove}
          onToggleRestore={onToggleRestore}
          openMove={openMoveTicketId === ticket.id}
          openRestore={openRestoreTicketId === ticket.id}
          pendingMove={pendingMove}
          restoreConflict={restoreConflictTicketId === ticket.id}
          slots={slots}
          ticket={ticket}
          scope={scope}
          unconfigured={unconfiguredTicketIds.has(ticket.id)}
          now={now}
        />
      ))
    );
  if (collapsed) {
    return (
      <details className="rounded-lg border px-4 py-3">
        <summary className="cursor-pointer text-xl font-bold">
          {title} <Badge variant="secondary">{tickets.length}件</Badge>
        </summary>
        <div className="mt-3 grid gap-3">{content}</div>
      </details>
    );
  }
  return (
    <section className="grid gap-3" aria-label={title}>
      <h2 className="text-xl font-bold">
        {title} <Badge variant="secondary">{tickets.length}件</Badge>
      </h2>
      {content}
    </section>
  );
}

function AdminTicketCard({
  ticket,
  slots,
  scope,
  onAction,
  actionPending,
  pendingMove,
  moveNotice,
  movePending,
  openMove,
  onToggleMove,
  onMoveSubmit,
  onMoveRetry,
  openRestore,
  onToggleRestore,
  restoreConflict,
  unconfigured,
  now,
}: {
  ticket: AdminTicket;
  slots: AdminReservations['slots'];
  scope: AdminScope;
  onAction: (action: AdminAction) => void;
  actionPending: boolean;
  pendingMove: PendingMoveRequest | null;
  moveNotice: boolean | null;
  movePending: boolean;
  openMove: boolean;
  onToggleMove: (ticketId: string) => void;
  onMoveSubmit: (request: PendingMoveRequest) => void;
  onMoveRetry: () => void;
  openRestore: boolean;
  onToggleRestore: (ticketId: string) => void;
  restoreConflict: boolean;
  unconfigured: boolean;
  now: number;
}) {
  const eventTime = useEventTime();
  const [reason, setReason] =
    useState<keyof typeof cancelReasonLabels>('staff');
  const [showPrintHistory, setShowPrintHistory] = useState(false);
  const detail = useAdminTicketDetail(scope, ticket.id, showPrintHistory);
  const latestPrintJobId = detail.data?.printJobs.at(-1)?.id;
  const canChange =
    ticket.reservation.kind === 'legacy'
      ? ticket.status === 'waiting' || ticket.status === 'called'
      : ticket.status === 'waiting';
  const canFinish = ticket.status === 'waiting' || ticket.status === 'called';
  const isReleased = isSlotReleased(ticket);
  const canRelease = ticket.reservation.kind === 'slot' && !isReleased;
  const restoreActionType =
    ticket.status === 'cancelled'
      ? 'restore'
      : ticket.status === 'served' || ticket.status === 'called'
        ? 'undo-guidance'
        : null;
  const ticketHasPendingMove = pendingMove?.ticketId === ticket.id;
  const operationBlocked = actionPending || pendingMove !== null;
  const moveUnavailable = pendingMove !== null && !ticketHasPendingMove;

  const releaseTicket = () => {
    const message =
      `${ticket.number}番（${reservationLabel(eventTime, ticket.reservation)}）の枠を解放し、` +
      `他の整理券で再利用できるようにします。` +
      (ticket.status === 'waiting'
        ? '整理券もスタッフ都合で取消になります。よろしいですか？'
        : '整理券の状態は保持されます。よろしいですか？');
    if (window.confirm(message)) {
      onAction({ type: 'release', ticketId: ticket.id });
    }
  };
  const undoGuidance = (body: AdminRestoreBody) => {
    const destination =
      'slotStartsAt' in body ? `復元先は${body.slotStartsAt}です。` : '';
    if (
      window.confirm(
        `${ticket.number}番の案内・入店を取り消し、待ち状態に戻します。${destination}よろしいですか？`,
      )
    ) {
      onAction({ type: 'undo-guidance', ticketId: ticket.id, body });
    }
  };

  return (
    <Card id={`ticket-${ticket.id}`} tabIndex={-1}>
      <CardContent className="grid gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-3xl font-bold tabular-nums">{ticket.number}番</p>
            <p className="text-sm text-muted-foreground">
              発券日 {ticket.counterKey} ・{' '}
              {eventTime.dateTime(ticket.issuedAt)}
            </p>
            <p className="mt-2 font-semibold">
              {reservationLabel(eventTime, ticket.reservation)}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {unconfigured && (
                <Badge variant="outline">現在の予約設定外</Badge>
              )}
              {isReleased && <Badge variant="destructive">枠解放済み</Badge>}
            </div>
          </div>
          <Badge
            variant={
              ticket.status === 'cancelled' ? 'destructive' : 'secondary'
            }
          >
            {ticketStatusLabel(ticket)}
          </Badge>
        </div>
        {isReleased && (
          <p
            className="rounded-md border border-destructive/40 p-3 text-sm"
            role="status"
          >
            この枠は解放済みです。現在の予約はありません。再印刷するには先に復元してください。
          </p>
        )}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {canFinish && (
            <>
              <Button
                size="lg"
                disabled={operationBlocked}
                onClick={() => onAction({ type: 'serve', ticketId: ticket.id })}
              >
                案内済みにする
              </Button>
              <label className="grid gap-1 text-xs text-muted-foreground">
                取消理由
                <select
                  aria-label={`${ticket.number}番の取消理由`}
                  className="min-h-12 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                  value={reason}
                  onChange={(event) =>
                    setReason(
                      event.currentTarget
                        .value as keyof typeof cancelReasonLabels,
                    )
                  }
                >
                  {Object.entries(cancelReasonLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                size="lg"
                variant="destructive"
                disabled={operationBlocked}
                onClick={() =>
                  onAction({ type: 'cancel', ticketId: ticket.id, reason })
                }
              >
                取消
              </Button>
            </>
          )}
          {canFinish && (
            <p className="text-sm text-muted-foreground sm:col-span-2 lg:col-span-4">
              通常の取消では予約枠を保持します。枠を空ける場合は「枠を解放」を選んでください。
            </p>
          )}
          {canRelease && (
            <Button
              size="lg"
              variant="destructive"
              disabled={operationBlocked}
              onClick={releaseTicket}
            >
              予約枠を解放
            </Button>
          )}
          {restoreActionType !== null && (
            <>
              <Button
                size="lg"
                variant="outline"
                disabled={operationBlocked}
                onClick={() => {
                  if (
                    ticket.reservation.kind === 'slot' &&
                    !confirmMidSlotUse(
                      eventTime,
                      {
                        startsAt: ticket.reservation.slotStartsAt,
                        experienceEndsAt: ticket.reservation.experienceEndsAt,
                      },
                      restoreActionType === 'restore'
                        ? '元の枠への復元'
                        : '案内取消',
                    )
                  ) {
                    return;
                  }
                  if (restoreActionType === 'undo-guidance') {
                    undoGuidance({});
                  } else {
                    onAction({
                      type: restoreActionType,
                      ticketId: ticket.id,
                      body: {},
                    });
                  }
                }}
              >
                {restoreActionType === 'restore'
                  ? isReleased
                    ? '元の枠に復元'
                    : 'キャンセルを取り消す'
                  : '案内・入店を取り消す'}
              </Button>
              {ticket.reservation.kind === 'slot' && isReleased && (
                <Button
                  size="lg"
                  variant="outline"
                  aria-expanded={openRestore}
                  disabled={operationBlocked}
                  onClick={() => onToggleRestore(ticket.id)}
                >
                  {openRestore ? '復元先の選択を閉じる' : '別の枠を選ぶ'}
                </Button>
              )}
            </>
          )}
          {canChange && (
            <Button
              size="lg"
              variant="outline"
              aria-expanded={openMove}
              disabled={actionPending || moveUnavailable}
              onClick={() => onToggleMove(ticket.id)}
            >
              {ticket.reservation.kind === 'legacy'
                ? '旧券に枠を割り当てる'
                : '日時・機材を変更'}
            </Button>
          )}
          <Button
            className="sm:col-span-2 lg:col-span-1"
            size="lg"
            variant="outline"
            aria-expanded={showPrintHistory}
            onClick={() => setShowPrintHistory((shown) => !shown)}
          >
            {showPrintHistory
              ? '印刷履歴を閉じる'
              : isReleased
                ? '印刷履歴（再印刷不可）'
                : '印刷履歴・再印刷'}
          </Button>
        </div>
        {moveNotice !== null && (
          <div
            className="grid gap-2 rounded-lg border bg-primary/5 p-4"
            role={moveNotice ? 'alert' : 'status'}
          >
            <p>
              {isReleased
                ? '枠解放済みのため、枠を復元するまで再印刷できません。'
                : moveNotice
                  ? '日時変更または旧券への枠割当のため、再印刷が必要です。'
                  : '機材のみを変更しました。再印刷は不要です。'}
            </p>
            {moveNotice && !isReleased && (
              <Button
                className="w-full sm:w-fit"
                disabled={operationBlocked}
                onClick={() =>
                  onAction({ type: 'reprint', ticketId: ticket.id })
                }
              >
                現在の予約で再印刷
              </Button>
            )}
          </div>
        )}
        {openMove && (
          <MoveTicketForm
            now={now}
            onCancel={() => onToggleMove(ticket.id)}
            onMoveRetry={onMoveRetry}
            onMoveSubmit={onMoveSubmit}
            pendingMove={ticketHasPendingMove ? pendingMove : null}
            movePending={movePending}
            slots={slots}
            ticket={ticket}
          />
        )}
        {openRestore &&
          restoreActionType !== null &&
          ticket.reservation.kind === 'slot' &&
          isReleased && (
            <RestoreTicketForm
              actionType={restoreActionType}
              conflict={restoreConflict}
              disabled={operationBlocked}
              now={now}
              onCancel={() => onToggleRestore(ticket.id)}
              onSubmit={(body) => {
                if (restoreActionType === 'undo-guidance') {
                  undoGuidance(body);
                } else {
                  onAction({
                    type: restoreActionType,
                    ticketId: ticket.id,
                    body,
                  });
                }
              }}
              slots={slots}
              ticket={ticket}
            />
          )}
        {showPrintHistory && (
          <div className="grid gap-3 rounded-lg border bg-muted/30 p-4">
            {detail.isPending && (
              <p aria-busy="true">印刷履歴を読み込んでいます…</p>
            )}
            {detail.isError && (
              <p role="alert">{adminErrorMessage(detail.error)}</p>
            )}
            {detail.data !== undefined &&
              detail.data.printJobs.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  印刷ジョブはありません。
                </p>
              )}
            {detail.data?.printJobs
              .slice()
              .reverse()
              .map((job) => (
                <div
                  className="flex flex-col gap-2 border-b pb-3 last:border-0 last:pb-0"
                  key={job.id}
                >
                  <p className="text-xs text-muted-foreground">
                    {eventTime.dateTime(job.createdAt)}
                  </p>
                  <PrintJobControls
                    allowReprint={!isReleased}
                    disabled={operationBlocked}
                    isLatest={job.id === latestPrintJobId}
                    job={job}
                    onReprint={() =>
                      onAction({ type: 'reprint', ticketId: ticket.id })
                    }
                  />
                  {job.detail && (
                    <p className="text-sm text-muted-foreground">
                      {job.detail}
                    </p>
                  )}
                </div>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RestoreTicketForm({
  actionType,
  ticket,
  slots,
  now,
  conflict,
  disabled,
  onCancel,
  onSubmit,
}: {
  actionType: 'restore' | 'undo-guidance';
  ticket: AdminTicket;
  slots: AdminReservations['slots'];
  now: number;
  conflict: boolean;
  disabled: boolean;
  onCancel: () => void;
  onSubmit: (body: AdminRestoreBody) => void;
}) {
  const eventTime = useEventTime();
  const original =
    ticket.reservation.kind === 'slot' ? ticket.reservation : null;
  const availableSlots = slots.filter(
    (slot) =>
      slot.bookable &&
      slot.ticket === null &&
      original !== null &&
      (slot.startsAt !== original.slotStartsAt ||
        slot.equipment !== original.equipment),
  );
  const [selectedSlotKey, setSelectedSlotKey] = useState('');
  const [confirmedMidSlot, setConfirmedMidSlot] = useState(false);
  const selectedSlot = availableSlots.find(
    (slot) => `${slot.startsAt}|${slot.equipment}` === selectedSlotKey,
  );
  const selectedIsMidSlot =
    selectedSlot !== undefined && isMidSlot(selectedSlot, now);
  const actionLabel =
    actionType === 'restore' ? 'キャンセル済み整理券' : '案内済み整理券';
  return (
    <form
      className="grid gap-3 rounded-lg border bg-muted/30 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (
          selectedSlot === undefined ||
          (selectedIsMidSlot && !confirmedMidSlot)
        ) {
          return;
        }
        if (
          !confirmMidSlotUse(
            eventTime,
            selectedSlot,
            actionType === 'restore' ? '別枠への復元' : '別枠で案内取消',
            confirmedMidSlot,
          )
        ) {
          return;
        }
        onSubmit({
          slotStartsAt: selectedSlot.startsAt,
          equipment: selectedSlot.equipment,
        });
      }}
    >
      <h3 className="font-semibold">別の予約枠に復元</h3>
      {conflict && (
        <p className="text-sm text-destructive" role="alert">
          元の枠を利用できません。最新の空き枠から復元先を選んでください。
        </p>
      )}
      <label className="grid gap-1 text-sm font-medium">
        {actionLabel}の復元先
        <select
          aria-label={`${ticket.number}番の復元先`}
          className="min-h-12 rounded-md border border-input bg-background px-3 text-base"
          value={selectedSlotKey}
          onChange={(event) => {
            setSelectedSlotKey(event.currentTarget.value);
            setConfirmedMidSlot(false);
          }}
        >
          <option value="">空き枠を選択</option>
          {availableSlots.map((slot) => {
            const midSlot = isMidSlot(slot, now);
            return (
              <option
                key={`${slot.startsAt}|${slot.equipment}`}
                value={`${slot.startsAt}|${slot.equipment}`}
              >
                {eventTime.dateTime(slot.startsAt)}・{slot.equipment}
                {midSlot
                  ? `（途中枠・${eventTime.time(slot.experienceEndsAt)}終了）`
                  : ''}
              </option>
            );
          })}
        </select>
      </label>
      {availableSlots.length === 0 && (
        <p className="text-sm text-muted-foreground">
          選択できる別の空き枠はありません。最新状態を再読み込みしてください。
        </p>
      )}
      {selectedIsMidSlot && selectedSlot !== undefined && (
        <label className="flex items-start gap-2 rounded-md border border-destructive/40 p-3 text-sm">
          <input
            className="mt-1 size-4"
            type="checkbox"
            checked={confirmedMidSlot}
            onChange={(event) =>
              setConfirmedMidSlot(event.currentTarget.checked)
            }
          />
          <span>
            途中枠を選びました。体験時間は延長されず、
            {eventTime.time(selectedSlot.experienceEndsAt)}に終了します。
            そのことを確認しました。
          </span>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={
            disabled ||
            selectedSlot === undefined ||
            (selectedIsMidSlot && !confirmedMidSlot)
          }
          type="submit"
        >
          {actionType === 'restore' ? '別枠に復元' : '別枠で案内取消'}
        </Button>
        <Button
          disabled={disabled}
          variant="outline"
          onClick={onCancel}
          type="button"
        >
          戻る
        </Button>
      </div>
    </form>
  );
}

function MoveTicketForm({
  now,
  ticket,
  slots,
  onCancel,
  pendingMove,
  movePending,
  onMoveSubmit,
  onMoveRetry,
}: {
  now: number;
  ticket: AdminTicket;
  slots: AdminReservations['slots'];
  onCancel: () => void;
  pendingMove: PendingMoveRequest | null;
  movePending: boolean;
  onMoveSubmit: (request: PendingMoveRequest) => void;
  onMoveRetry: () => void;
}) {
  const eventTime = useEventTime();
  const [destinationKey, setDestinationKey] = useState('');
  const [comment, setComment] = useState('');
  const [assignmentConfirmed, setAssignmentConfirmed] = useState(false);
  const eligibleSlots = slots.filter(
    (slot) =>
      slot.bookable &&
      slot.ticket === null &&
      !(
        ticket.reservation.kind === 'slot' &&
        slot.startsAt === ticket.reservation.slotStartsAt &&
        slot.equipment === ticket.reservation.equipment
      ),
  );
  const destination = eligibleSlots.find(
    (slot) => slotKey(slot) === destinationKey,
  );
  const destinationIsMidSlot =
    destination !== undefined && isMidSlot(destination, now);
  const selectedSlotUnavailable =
    destinationKey !== '' && destination === undefined;
  const commentLength = Array.from(comment).length;
  const hasControlCharacter = Array.from(comment).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 0x20 || codePoint === 0x7f;
  });
  const commentValid = commentLength <= 200 && !hasControlCharacter;
  const isLegacy = ticket.reservation.kind === 'legacy';
  const timeChangeNeedsReprint =
    isLegacy ||
    (ticket.reservation.kind === 'slot' &&
      destination !== undefined &&
      destination.startsAt !== ticket.reservation.slotStartsAt);

  if (pendingMove !== null) {
    return (
      <div className="grid gap-4 rounded-lg border bg-muted/30 p-4">
        <h3 className="text-lg font-bold">移動結果の確認が必要です</h3>
        <p>変更前: {reservationLabel(eventTime, pendingMove.from)}</p>
        <p>
          変更先: {eventTime.date(pendingMove.slotStartsAt)}{' '}
          {eventTime.time(pendingMove.slotStartsAt)}・{pendingMove.equipment}
        </p>
        {pendingMove.comment !== undefined && (
          <p>来場者へのコメント: {pendingMove.comment}</p>
        )}
        <p>結果を解決するまで移動先やコメントは変更できません。</p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={movePending} onClick={onMoveRetry}>
            {movePending ? '移動中…' : '同じ移動内容で再試行'}
          </Button>
          <Button variant="outline" type="button" onClick={onCancel}>
            閉じる
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="grid gap-4 rounded-lg border bg-muted/30 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (
          destination === undefined ||
          !commentValid ||
          (isLegacy && !assignmentConfirmed)
        ) {
          return;
        }
        if (!confirmMidSlotUse(eventTime, destination, '移動')) return;
        onMoveSubmit({
          ticketId: ticket.id,
          from: ticket.reservation,
          slotStartsAt: destination.startsAt,
          equipment: destination.equipment,
          ...(comment.trim().length === 0 ? {} : { comment }),
        });
      }}
    >
      <h3 className="text-lg font-bold">
        {isLegacy ? '旧券への枠割当' : '予約枠の変更'}
      </h3>
      <label
        className="grid gap-2 text-sm font-medium"
        htmlFor={`move-${ticket.id}`}
      >
        移動先の枠
        <select
          className="min-h-12 rounded-md border border-input bg-background px-3 text-base"
          id={`move-${ticket.id}`}
          value={destinationKey}
          onChange={(event) => setDestinationKey(event.currentTarget.value)}
          required
        >
          <option value="">移動先を選択してください</option>
          {selectedSlotUnavailable && (
            <option value={destinationKey}>
              選択した枠は候補から外れました
            </option>
          )}
          {eligibleSlots.map((slot) => {
            const midSlot = isMidSlot(slot, now);
            return (
              <option key={slotKey(slot)} value={slotKey(slot)}>
                {eventTime.date(slot.startsAt)} {eventTime.time(slot.startsAt)}
                ・{slot.equipment}
                {midSlot
                  ? `（途中枠・体験終了${eventTime.time(slot.experienceEndsAt)}まで）`
                  : ''}
              </option>
            );
          })}
          {eligibleSlots.length === 0 && !selectedSlotUnavailable && (
            <option disabled>選択できる空き枠がありません</option>
          )}
        </select>
      </label>
      {selectedSlotUnavailable && (
        <p className="text-sm text-destructive" role="alert">
          選択した枠は最新状況では利用できません。別の枠を明示的に選択してください。
        </p>
      )}
      {destination !== undefined && (
        <dl className="grid gap-2 rounded-md border bg-background p-3 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="font-semibold">変更前</dt>
          <dd>{reservationLabel(eventTime, ticket.reservation)}</dd>
          <dt className="font-semibold">変更後</dt>
          <dd>
            {eventTime.date(destination.startsAt)}{' '}
            {eventTime.time(destination.startsAt)}・{destination.equipment}
          </dd>
        </dl>
      )}
      {destinationIsMidSlot && destination !== undefined && (
        <p
          className="rounded-md border border-destructive/40 p-3 text-sm"
          role="status"
        >
          途中枠です。体験時間は{eventTime.time(destination.experienceEndsAt)}
          に終了し、延長されません。移動確定時に確認します。
        </p>
      )}
      {destination !== undefined && timeChangeNeedsReprint && (
        <p
          className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm font-medium"
          role="alert"
        >
          変更を確定すると旧用紙は無効になります。現在の予約内容で再印刷してください。
        </p>
      )}
      <label
        className="grid gap-2 text-sm font-medium"
        htmlFor={`comment-${ticket.id}`}
      >
        来場者へのコメント（任意・200文字以内）
        <input
          className="min-h-12 rounded-md border border-input bg-background px-3 text-base"
          id={`comment-${ticket.id}`}
          value={comment}
          onChange={(event) => setComment(event.currentTarget.value)}
        />
      </label>
      <p className="text-sm text-muted-foreground">
        来場者に公開されます。氏名・連絡先などは入力しないでください。
        {commentLength}/200文字
      </p>
      {!commentValid && (
        <p className="text-sm text-destructive" role="alert">
          コメントは制御文字なしの200文字以内で入力してください。
        </p>
      )}
      {isLegacy && (
        <label className="flex items-start gap-3 text-sm font-medium">
          <input
            className="mt-1 size-5"
            type="checkbox"
            checked={assignmentConfirmed}
            onChange={(event) =>
              setAssignmentConfirmed(event.currentTarget.checked)
            }
          />
          現場で個別割当の合意を確認しました。枠割当後は旧券の再印刷が必要です。
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={
            movePending ||
            destination === undefined ||
            !commentValid ||
            (isLegacy && !assignmentConfirmed)
          }
          type="submit"
        >
          変更を確定する
        </Button>
        <Button variant="outline" type="button" onClick={onCancel}>
          戻る
        </Button>
      </div>
    </form>
  );
}

function PrintAttentionSection({
  items,
  actionPending,
  onOpenTicket,
  onReprint,
}: {
  items: AdminReservations['printNeedsAttention'];
  actionPending: boolean;
  onOpenTicket: (ticketId: string) => void;
  onReprint: (ticketId: string) => void;
}) {
  return (
    <section className="grid gap-3" aria-labelledby="print-attention-title">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold" id="print-attention-title">
          <Printer className="mr-2 inline size-5" aria-hidden="true" />
          印刷要対応
        </h2>
        <Badge variant={items.length > 0 ? 'destructive' : 'secondary'}>
          {items.length}件
        </Badge>
      </div>
      {items.length === 0 ? (
        <Card>
          <CardContent className="p-5 text-muted-foreground">
            対応が必要な印刷はありません。
          </CardContent>
        </Card>
      ) : (
        items.map(({ ticket, job }) => (
          <Card key={job.id}>
            <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-2xl font-bold tabular-nums">
                  {ticket.number}番
                </p>
                <p className="text-sm text-muted-foreground">
                  {printStatusLabels[job.status]}
                </p>
                <a
                  className="text-sm font-semibold underline underline-offset-2"
                  href={`#ticket-${ticket.id}`}
                  onClick={() => onOpenTicket(ticket.id)}
                >
                  整理券を確認
                </a>
              </div>
              <div className="grid gap-2">
                {isSlotReleased(ticket) && (
                  <p className="text-sm text-destructive">
                    枠解放済みのため、復元するまで再印刷できません。
                  </p>
                )}
                <PrintJobControls
                  allowReprint={!isSlotReleased(ticket)}
                  disabled={actionPending}
                  job={job}
                  onReprint={() => onReprint(ticket.id)}
                />
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </section>
  );
}

export function PrintJobControls({
  job,
  onReprint,
  disabled,
  isLatest = true,
  allowReprint = true,
}: {
  job: Pick<AdminPrintJob, 'status' | 'outputKind'>;
  onReprint: () => void;
  disabled: boolean;
  isLatest?: boolean;
  allowReprint?: boolean;
}) {
  const reprintable = allowReprint && isLatest && canReprint(job.status);
  return (
    <div className="grid gap-2">
      <p
        className={`font-semibold ${isLatest && (job.status === 'failed' || job.status === 'unknown') ? 'text-destructive' : ''}`}
      >
        {printStatusLabels[job.status]}
      </p>
      {job.outputKind === 'preview' && (
        <p className="text-sm font-medium" data-testid="print-preview-notice">
          <Badge variant="outline">プレビュー出力</Badge>{' '}
          用紙には印刷されていません。
        </p>
      )}
      {isLatest && job.status === 'unknown' && (
        <p
          className="flex items-start gap-2 text-sm font-medium text-destructive"
          role="alert"
        >
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          印刷結果が不明です。用紙を目視確認してから再印刷してください。
        </p>
      )}
      {reprintable && (
        <Button
          size="lg"
          variant={job.status === 'printed' ? 'secondary' : 'destructive'}
          onClick={onReprint}
          disabled={disabled}
        >
          再印刷
        </Button>
      )}
    </div>
  );
}
