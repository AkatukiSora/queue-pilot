import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Printer, Ticket } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card.tsx';
import {
  ADMIN_EQUIPMENT_VALUES,
  ADMIN_TOKEN_STORAGE_KEY,
  type AdminAction,
  AdminApiError,
  type AdminPrintJob,
  type AdminReservations,
  type AdminSlot,
  type AdminTicket,
  adminErrorMessage,
  canReprint,
  type PrintJobStatus,
  useAdminAction,
  useAdminReservations,
  useAdminTicketDetail,
  useIssueTicket,
  useRescheduleTicket,
} from './admin-api.ts';

const equipmentColumns = ADMIN_EQUIPMENT_VALUES;

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

function jstParts(value: string) {
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    hour: part('hour'),
    minute: part('minute'),
  };
}

function formatJstDate(value: string) {
  const parts = jstParts(value);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatJstTime(value: string) {
  const parts = jstParts(value);
  return `${parts.hour}:${parts.minute}`;
}

function formatJstDateTime(value: string) {
  return `${formatJstDate(value)} ${formatJstTime(value)} (JST)`;
}

function slotKey(slot: Pick<AdminSlot, 'startsAt' | 'equipment'>) {
  return `${slot.startsAt}|${slot.equipment}`;
}

function reservationLabel(reservation: AdminTicket['reservation']) {
  if (reservation.kind === 'legacy') return '時間未割当の旧整理券';
  return `${formatJstDate(reservation.slotStartsAt)} ${formatJstTime(reservation.slotStartsAt)}〜${formatJstTime(reservation.experienceEndsAt)}・${reservation.equipment}`;
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
    ADMIN_EQUIPMENT_VALUES.some((equipment) => equipment === value.equipment) &&
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
    ADMIN_EQUIPMENT_VALUES.some((equipment) => equipment === value.equipment) &&
    (value.comment === undefined || typeof value.comment === 'string')
  );
}

function readPendingMoveRequest(): PendingMoveRequest | null {
  const value = readSessionJson(PENDING_MOVE_STORAGE_KEY);
  if (isPendingMoveRequest(value)) return value;
  if (value !== null)
    window.sessionStorage.removeItem(PENDING_MOVE_STORAGE_KEY);
  return null;
}

function storePendingMoveRequest(request: PendingMoveRequest | null) {
  if (request === null) {
    window.sessionStorage.removeItem(PENDING_MOVE_STORAGE_KEY);
  } else {
    window.sessionStorage.setItem(
      PENDING_MOVE_STORAGE_KEY,
      JSON.stringify(request),
    );
  }
}

function readMoveNotices(): Record<string, boolean> {
  const value = readSessionJson(MOVE_NOTICES_STORAGE_KEY);
  if (!isRecord(value)) {
    if (value !== null)
      window.sessionStorage.removeItem(MOVE_NOTICES_STORAGE_KEY);
    return {};
  }
  const notices: Record<string, boolean> = {};
  for (const [ticketId, needsReprint] of Object.entries(value)) {
    if (needsReprint === true) notices[ticketId] = true;
  }
  return notices;
}

function storeMoveNotices(notices: Record<string, boolean>) {
  const unresolved = Object.fromEntries(
    Object.entries(notices).filter(([, needsReprint]) => needsReprint),
  );
  if (Object.keys(unresolved).length === 0) {
    window.sessionStorage.removeItem(MOVE_NOTICES_STORAGE_KEY);
  } else {
    window.sessionStorage.setItem(
      MOVE_NOTICES_STORAGE_KEY,
      JSON.stringify(unresolved),
    );
  }
}

export function AdminScreen() {
  const queryClient = useQueryClient();
  const [token, setToken] = useState(
    () => window.sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) ?? '',
  );

  const clearToken = useCallback(() => {
    window.sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    queryClient.removeQueries({ queryKey: ['admin'] });
    setToken('');
  }, [queryClient]);

  function saveToken(value: string) {
    const nextToken = value.trim();
    if (nextToken.length === 0) return;
    window.sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, nextToken);
    setToken(nextToken);
  }

  if (token.length === 0) return <AdminTokenForm onSave={saveToken} />;
  return <AdminDashboard token={token} onUnauthorized={clearToken} />;
}

function AdminTokenForm({ onSave }: { onSave: (token: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-4 py-8">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>管理者トークンを入力</CardTitle>
          <CardDescription>
            トークンはこのタブの sessionStorage に保存されます。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              onSave(value);
            }}
          >
            <label
              className="grid gap-2 text-sm font-medium"
              htmlFor="admin-token"
            >
              管理者トークン
              <input
                id="admin-token"
                type="password"
                autoComplete="off"
                required
                className="min-h-12 rounded-md border border-input bg-background px-3 text-base"
                value={value}
                onChange={(event) => setValue(event.currentTarget.value)}
              />
            </label>
            <Button className="w-full" size="lg" type="submit">
              管理画面を開く
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

function AdminDashboard({
  token,
  onUnauthorized,
}: {
  token: string;
  onUnauthorized: () => void;
}) {
  const reservations = useAdminReservations(token, onUnauthorized);
  const action = useAdminAction(token, onUnauthorized);
  const issue = useIssueTicket(token, onUnauthorized);
  const reschedule = useRescheduleTicket(token, onUnauthorized);
  const [selectedDate, setSelectedDate] = useState('');
  const [pendingMove, setPendingMove] = useState<PendingMoveRequest | null>(
    () => readPendingMoveRequest(),
  );
  const [moveNotices, setMoveNotices] = useState(readMoveNotices);
  const [openMoveTicketId, setOpenMoveTicketId] = useState<string | null>(
    () => pendingMove?.ticketId ?? null,
  );
  const conflictingMutationPending =
    action.isPending ||
    issue.mutation.isPending ||
    issue.hasUnresolvedRequest ||
    reschedule.isPending;
  const operationBlocked = conflictingMutationPending || pendingMove !== null;
  const updatePendingMove = (request: PendingMoveRequest | null) => {
    storePendingMoveRequest(request);
    setPendingMove(request);
  };
  const updateMoveNotices = (notices: Record<string, boolean>) => {
    storeMoveNotices(notices);
    setMoveNotices(notices);
  };
  const runAction = (nextAction: AdminAction) => {
    if (operationBlocked) return;
    if (nextAction.type !== 'reprint') {
      action.mutate(nextAction);
      return;
    }
    const { ticketId } = nextAction;
    action.mutate(nextAction, {
      onSuccess: () => {
        const next = { ...moveNotices };
        delete next[ticketId];
        updateMoveNotices(next);
      },
    });
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
            error instanceof AdminApiError &&
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
  const dates = [
    ...new Set(
      reservations.data?.slots.map((slot) => formatJstDate(slot.startsAt)) ??
        [],
    ),
  ];
  const activeDate = dates.includes(selectedDate) ? selectedDate : dates[0];
  const slotTickets =
    reservations.data?.slots.flatMap((slot) =>
      slot.ticket === null ? [] : [slot.ticket],
    ) ?? [];

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-7xl content-start gap-5 px-4 py-6 sm:px-6 sm:py-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-primary">文化祭 整理券</p>
          <h1 className="text-3xl font-bold tracking-tight">管理画面</h1>
        </div>
        <Button variant="outline" onClick={onUnauthorized}>
          トークンを消去
        </Button>
      </header>

      {action.isError && (
        <p
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-base"
          role="alert"
        >
          {adminErrorMessage(action.error)}
        </p>
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
          <p>変更前: {reservationLabel(pendingMove.from)}</p>
          <p>
            変更先: {formatJstDate(pendingMove.slotStartsAt)}{' '}
            {formatJstTime(pendingMove.slotStartsAt)}・{pendingMove.equipment}
          </p>
          {pendingMove.comment !== undefined && (
            <p>来場者へのコメント: {pendingMove.comment}</p>
          )}
          {reschedule.isError && <p>{adminErrorMessage(reschedule.error)}</p>}
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
      {reschedule.isError && pendingMove === null && (
        <p role="alert">{adminErrorMessage(reschedule.error)}</p>
      )}

      {issue.mutation.isSuccess && issue.mutation.data !== undefined && (
        <p
          className="rounded-lg border bg-primary/5 p-4 text-lg font-semibold"
          role="status"
        >
          {issue.mutation.data.number}番を発券しました。
          {issue.mutation.data.reservation.kind === 'slot' && (
            <span className="mt-1 block text-base font-medium">
              {formatJstDate(issue.mutation.data.reservation.slotStartsAt)}{' '}
              {formatJstTime(issue.mutation.data.reservation.slotStartsAt)}・
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
            title="予約済み・過去の予約"
            tickets={slotTickets}
            slots={reservations.data.slots}
            token={token}
            onUnauthorized={onUnauthorized}
            onAction={runAction}
            actionPending={conflictingMutationPending}
            pendingMove={pendingMove}
            moveNotices={moveNotices}
            movePending={conflictingMutationPending}
            openMoveTicketId={openMoveTicketId}
            onToggleMove={toggleMove}
            onMoveSubmit={submitMove}
            onMoveRetry={retryMove}
          />
          <TicketSection
            title="時間未割当の旧整理券"
            tickets={reservations.data.legacyTickets}
            slots={reservations.data.slots}
            token={token}
            onUnauthorized={onUnauthorized}
            onAction={runAction}
            actionPending={conflictingMutationPending}
            pendingMove={pendingMove}
            moveNotices={moveNotices}
            movePending={conflictingMutationPending}
            openMoveTicketId={openMoveTicketId}
            onToggleMove={toggleMove}
            onMoveSubmit={submitMove}
            onMoveRetry={retryMove}
          />
          <TicketSection
            title="設定外の予約"
            tickets={reservations.data.unconfiguredTickets}
            slots={reservations.data.slots}
            token={token}
            onUnauthorized={onUnauthorized}
            onAction={runAction}
            actionPending={conflictingMutationPending}
            pendingMove={pendingMove}
            moveNotices={moveNotices}
            movePending={conflictingMutationPending}
            openMoveTicketId={openMoveTicketId}
            onToggleMove={toggleMove}
            onMoveSubmit={submitMove}
            onMoveRetry={retryMove}
          />

          <PrintAttentionSection
            items={reservations.data.printNeedsAttention}
            actionPending={operationBlocked}
            onReprint={(ticketId) => runAction({ type: 'reprint', ticketId })}
          />
        </>
      )}
    </main>
  );
}

function ReservationBoard({
  date,
  slots,
  onIssue,
  issuePending,
}: {
  date: string;
  slots: AdminReservations['slots'];
  onIssue: (slot: AdminSlot) => void;
  issuePending: boolean;
}) {
  const daySlots = slots.filter(
    (slot) => formatJstDate(slot.startsAt) === date,
  );
  const rows = [
    ...new Set(daySlots.map((slot) => formatJstTime(slot.startsAt))),
  ].sort();
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="min-w-[52rem] w-full border-collapse text-left">
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
                    formatJstTime(candidate.startsAt) === time &&
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
                if (slot.ticket !== null) {
                  return (
                    <td className="p-3" key={equipment}>
                      <a
                        className="font-semibold underline underline-offset-2"
                        href={`#ticket-${slot.ticket.id}`}
                      >
                        {slot.ticket.number}番・{ticketStatusLabel(slot.ticket)}
                      </a>
                    </td>
                  );
                }
                return (
                  <td className="p-3" key={equipment}>
                    {slot.bookable ? (
                      <Button
                        size="sm"
                        disabled={issuePending}
                        onClick={() => onIssue(slot)}
                      >
                        空き・発券
                      </Button>
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
  title,
  tickets,
  slots,
  token,
  onUnauthorized,
  onAction,
  actionPending,
  pendingMove,
  moveNotices,
  movePending,
  openMoveTicketId,
  onToggleMove,
  onMoveSubmit,
  onMoveRetry,
}: {
  title: string;
  tickets: AdminTicket[];
  slots: AdminReservations['slots'];
  token: string;
  onUnauthorized: () => void;
  onAction: (action: AdminAction) => void;
  actionPending: boolean;
  pendingMove: PendingMoveRequest | null;
  moveNotices: Record<string, boolean>;
  movePending: boolean;
  openMoveTicketId: string | null;
  onToggleMove: (ticketId: string) => void;
  onMoveSubmit: (request: PendingMoveRequest) => void;
  onMoveRetry: () => void;
}) {
  return (
    <section className="grid gap-3" aria-label={title}>
      <h2 className="text-xl font-bold">
        {title} <Badge variant="secondary">{tickets.length}件</Badge>
      </h2>
      {tickets.length === 0 ? (
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
            openMove={openMoveTicketId === ticket.id}
            pendingMove={pendingMove}
            slots={slots}
            ticket={ticket}
            token={token}
            onUnauthorized={onUnauthorized}
          />
        ))
      )}
    </section>
  );
}

function AdminTicketCard({
  ticket,
  slots,
  token,
  onUnauthorized,
  onAction,
  actionPending,
  pendingMove,
  moveNotice,
  movePending,
  openMove,
  onToggleMove,
  onMoveSubmit,
  onMoveRetry,
}: {
  ticket: AdminTicket;
  slots: AdminReservations['slots'];
  token: string;
  onUnauthorized: () => void;
  onAction: (action: AdminAction) => void;
  actionPending: boolean;
  pendingMove: PendingMoveRequest | null;
  moveNotice: boolean | null;
  movePending: boolean;
  openMove: boolean;
  onToggleMove: (ticketId: string) => void;
  onMoveSubmit: (request: PendingMoveRequest) => void;
  onMoveRetry: () => void;
}) {
  const [reason, setReason] =
    useState<keyof typeof cancelReasonLabels>('staff');
  const [showPrintHistory, setShowPrintHistory] = useState(false);
  const detail = useAdminTicketDetail(
    token,
    ticket.id,
    showPrintHistory,
    onUnauthorized,
  );
  const latestPrintJobId = detail.data?.printJobs.at(-1)?.id;
  const canChange =
    ticket.reservation.kind === 'legacy'
      ? ticket.status === 'waiting' || ticket.status === 'called'
      : ticket.status === 'waiting';
  const canFinish = ticket.status === 'waiting' || ticket.status === 'called';
  const ticketHasPendingMove = pendingMove?.ticketId === ticket.id;
  const operationBlocked = actionPending || pendingMove !== null;
  const moveUnavailable = pendingMove !== null && !ticketHasPendingMove;

  return (
    <Card id={`ticket-${ticket.id}`}>
      <CardContent className="grid gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-3xl font-bold tabular-nums">{ticket.number}番</p>
            <p className="text-sm text-muted-foreground">
              発券日 {ticket.counterKey} ・ {formatJstDateTime(ticket.issuedAt)}
            </p>
            <p className="mt-2 font-semibold">
              {reservationLabel(ticket.reservation)}
            </p>
          </div>
          <Badge
            variant={
              ticket.status === 'cancelled' ? 'destructive' : 'secondary'
            }
          >
            {ticketStatusLabel(ticket)}
          </Badge>
        </div>
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
            {showPrintHistory ? '印刷履歴を閉じる' : '印刷履歴・再印刷'}
          </Button>
        </div>
        {moveNotice !== null && (
          <div
            className="grid gap-2 rounded-lg border bg-primary/5 p-4"
            role={moveNotice ? 'alert' : 'status'}
          >
            <p>
              {moveNotice
                ? '日時変更または旧券への枠割当のため、再印刷が必要です。'
                : '機材のみを変更しました。再印刷は不要です。'}
            </p>
            {moveNotice && (
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
            onCancel={() => onToggleMove(ticket.id)}
            onMoveRetry={onMoveRetry}
            onMoveSubmit={onMoveSubmit}
            pendingMove={ticketHasPendingMove ? pendingMove : null}
            movePending={movePending}
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
                    {formatJstDateTime(job.createdAt)}
                  </p>
                  <PrintJobControls
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

function MoveTicketForm({
  ticket,
  slots,
  onCancel,
  pendingMove,
  movePending,
  onMoveSubmit,
  onMoveRetry,
}: {
  ticket: AdminTicket;
  slots: AdminReservations['slots'];
  onCancel: () => void;
  pendingMove: PendingMoveRequest | null;
  movePending: boolean;
  onMoveSubmit: (request: PendingMoveRequest) => void;
  onMoveRetry: () => void;
}) {
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
        <p>変更前: {reservationLabel(pendingMove.from)}</p>
        <p>
          変更先: {formatJstDate(pendingMove.slotStartsAt)}{' '}
          {formatJstTime(pendingMove.slotStartsAt)}・{pendingMove.equipment}
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
          {eligibleSlots.map((slot) => (
            <option key={slotKey(slot)} value={slotKey(slot)}>
              {formatJstDate(slot.startsAt)} {formatJstTime(slot.startsAt)}・
              {slot.equipment}
            </option>
          ))}
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
          <dd>{reservationLabel(ticket.reservation)}</dd>
          <dt className="font-semibold">変更後</dt>
          <dd>
            {formatJstDate(destination.startsAt)}{' '}
            {formatJstTime(destination.startsAt)}・{destination.equipment}
          </dd>
        </dl>
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
  onReprint,
}: {
  items: AdminReservations['printNeedsAttention'];
  actionPending: boolean;
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
              </div>
              <PrintJobControls
                disabled={actionPending}
                job={job}
                onReprint={() => onReprint(ticket.id)}
              />
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
}: {
  job: Pick<AdminPrintJob, 'status'>;
  onReprint: () => void;
  disabled: boolean;
  isLatest?: boolean;
}) {
  const reprintable = isLatest && canReprint(job.status);
  return (
    <div className="grid gap-2">
      <p
        className={`font-semibold ${isLatest && (job.status === 'failed' || job.status === 'unknown') ? 'text-destructive' : ''}`}
      >
        {printStatusLabels[job.status]}
      </p>
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
