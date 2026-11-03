import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Printer, RefreshCw, Ticket, Users } from 'lucide-react';
import type { ReactNode } from 'react';
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
  ADMIN_TOKEN_STORAGE_KEY,
  type AdminAction,
  type AdminPrintJob,
  type AdminQueueTicket,
  adminErrorMessage,
  canReprint,
  type PrintJobStatus,
  useAdminAction,
  useAdminQueue,
  useAdminTicketDetail,
  useIssueTicket,
} from './admin-api.ts';

const ticketStatusLabels = {
  waiting: '待機中',
  called: '呼出中',
  served: '入店済み',
  cancelled: 'キャンセル',
} as const;

const cancelReasonLabels = {
  visitor: '来店者都合',
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
  const queue = useAdminQueue(token, onUnauthorized);
  const action = useAdminAction(token, onUnauthorized);
  const issue = useIssueTicket(token, onUnauthorized);
  const [partySize, setPartySize] = useState(1);
  const runAction = (nextAction: AdminAction) => action.mutate(nextAction);

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-5xl content-start gap-5 px-4 py-6 sm:px-6 sm:py-10">
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ticket className="size-5" aria-hidden="true" />
            発券
          </CardTitle>
          <CardDescription>
            発券後、整理券番号が画面に表示されます。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              issue.issue(partySize);
            }}
          >
            <label
              className="grid gap-2 text-sm font-medium"
              htmlFor="party-size"
            >
              人数
              <input
                id="party-size"
                type="number"
                min={1}
                max={20}
                step={1}
                required
                className="min-h-12 rounded-md border border-input bg-background px-3 text-lg tabular-nums"
                value={partySize}
                onChange={(event) =>
                  setPartySize(Number(event.currentTarget.value))
                }
              />
            </label>
            <Button
              className="w-full sm:w-auto"
              size="lg"
              type="submit"
              disabled={issue.mutation.isPending || issue.mutation.isError}
            >
              {issue.mutation.isPending ? '発券中…' : '発券する'}
            </Button>
          </form>
          {issue.mutation.isError && (
            <div className="mt-4 grid gap-3" role="alert">
              <p>{adminErrorMessage(issue.mutation.error)}</p>
              <Button
                className="w-full sm:w-auto"
                size="lg"
                variant="outline"
                onClick={issue.retry}
                disabled={issue.mutation.isPending}
              >
                同じ内容で再試行
              </Button>
            </div>
          )}
          {issue.mutation.isSuccess && issue.mutation.data !== undefined && (
            <p className="mt-4 text-xl font-bold" role="status">
              {issue.mutation.data.number}番を発券しました。
            </p>
          )}
        </CardContent>
      </Card>

      <section aria-labelledby="counts-title">
        <h2 className="mb-3 text-xl font-bold" id="counts-title">
          状態別件数
        </h2>
        {queue.data === undefined ? (
          <p className="text-sm text-muted-foreground">
            一覧を読み込んでいます。
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.entries(ticketStatusLabels).map(([status, label]) => (
              <Card className="text-center" key={status}>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="mt-1 text-3xl font-bold tabular-nums">
                    {
                      queue.data.statusCounts[
                        status as keyof typeof ticketStatusLabels
                      ]
                    }
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {queue.isPending && <p aria-busy="true">待機状況を読み込んでいます…</p>}
      {queue.isError && (
        <Card>
          <CardContent className="grid gap-3 p-5">
            <p role="alert">{adminErrorMessage(queue.error)}</p>
            <Button
              className="w-full sm:w-auto"
              onClick={() => void queue.refetch()}
            >
              再読み込み
            </Button>
          </CardContent>
        </Card>
      )}
      {queue.data !== undefined && (
        <>
          <section
            className="grid gap-3"
            aria-labelledby="print-attention-title"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold" id="print-attention-title">
                <Printer className="mr-2 inline size-5" aria-hidden="true" />
                印刷要対応
              </h2>
              <Badge
                variant={
                  queue.data.printNeedsAttention.length > 0
                    ? 'destructive'
                    : 'secondary'
                }
              >
                {queue.data.printNeedsAttention.length}件
              </Badge>
            </div>
            {queue.data.printNeedsAttention.length === 0 ? (
              <Card>
                <CardContent className="p-5 text-muted-foreground">
                  対応が必要な印刷はありません。
                </CardContent>
              </Card>
            ) : (
              queue.data.printNeedsAttention.map(({ ticket, job }) => (
                <Card key={job.id}>
                  <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-2xl font-bold tabular-nums">
                        {ticket.number}番
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {ticket.partySize}人・{printStatusLabels[job.status]}
                      </p>
                    </div>
                    <PrintJobControls
                      disabled={action.isPending}
                      job={job}
                      onReprint={() =>
                        runAction({ type: 'reprint', ticketId: ticket.id })
                      }
                    />
                  </CardContent>
                </Card>
              ))
            )}
          </section>

          <QueueSection
            title="待機中"
            icon={<Users className="size-5" aria-hidden="true" />}
            tickets={queue.data.waiting}
            token={token}
            onUnauthorized={onUnauthorized}
            onAction={runAction}
            actionPending={action.isPending}
          />
          <QueueSection
            title="呼出中"
            icon={<RefreshCw className="size-5" aria-hidden="true" />}
            tickets={queue.data.called}
            token={token}
            onUnauthorized={onUnauthorized}
            onAction={runAction}
            actionPending={action.isPending}
          />
          <p
            className="text-center text-sm text-muted-foreground"
            aria-live="polite"
          >
            状況は3秒ごとに自動更新されます。
            {queue.isFetching && ' 更新中…'}
          </p>
        </>
      )}
    </main>
  );
}

function QueueSection({
  title,
  icon,
  tickets,
  token,
  onUnauthorized,
  onAction,
  actionPending,
}: {
  title: string;
  icon: ReactNode;
  tickets: AdminQueueTicket[];
  token: string;
  onUnauthorized: () => void;
  onAction: (action: AdminAction) => void;
  actionPending: boolean;
}) {
  return (
    <section className="grid gap-3" aria-label={title}>
      <h2 className="flex items-center gap-2 text-xl font-bold">
        {icon}
        {title}
        <Badge variant="secondary">{tickets.length}件</Badge>
      </h2>
      {tickets.length === 0 ? (
        <Card>
          <CardContent className="p-5 text-muted-foreground">
            現在、{title}の整理券はありません。
          </CardContent>
        </Card>
      ) : (
        tickets.map((ticket) => (
          <AdminTicketRow
            actionPending={actionPending}
            key={ticket.id}
            onAction={onAction}
            onUnauthorized={onUnauthorized}
            ticket={ticket}
            token={token}
          />
        ))
      )}
    </section>
  );
}

function AdminTicketRow({
  ticket,
  token,
  onUnauthorized,
  onAction,
  actionPending,
}: {
  ticket: AdminQueueTicket;
  token: string;
  onUnauthorized: () => void;
  onAction: (action: AdminAction) => void;
  actionPending: boolean;
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

  return (
    <Card>
      <CardContent className="grid gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-3xl font-bold tabular-nums">{ticket.number}番</p>
            <p className="text-sm text-muted-foreground">
              {ticket.partySize}人
            </p>
          </div>
          <Badge variant={ticket.status === 'called' ? 'default' : 'secondary'}>
            {ticketStatusLabels[ticket.status]}
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ticket.status === 'waiting' ? (
            <Button
              size="lg"
              disabled={actionPending}
              onClick={() => onAction({ type: 'call', ticketId: ticket.id })}
            >
              呼出
            </Button>
          ) : (
            <>
              <Button
                size="lg"
                disabled={actionPending}
                onClick={() => onAction({ type: 'serve', ticketId: ticket.id })}
              >
                入店
              </Button>
              <Button
                size="lg"
                variant="outline"
                disabled={actionPending}
                onClick={() =>
                  onAction({ type: 'recall', ticketId: ticket.id })
                }
              >
                呼出取消
              </Button>
            </>
          )}
          <label className="col-span-2 grid gap-1 text-xs text-muted-foreground sm:col-span-1">
            キャンセル理由
            <select
              aria-label={`${ticket.number}番のキャンセル理由`}
              className="min-h-12 rounded-md border border-input bg-background px-2 text-sm text-foreground"
              value={reason}
              onChange={(event) =>
                setReason(
                  event.currentTarget.value as keyof typeof cancelReasonLabels,
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
            disabled={actionPending}
            onClick={() =>
              onAction({ type: 'cancel', ticketId: ticket.id, reason })
            }
          >
            キャンセル
          </Button>
          <Button
            className="col-span-2 sm:col-span-4"
            size="lg"
            variant="outline"
            aria-expanded={showPrintHistory}
            onClick={() => setShowPrintHistory((shown) => !shown)}
          >
            {showPrintHistory ? '印刷履歴を閉じる' : '印刷状態・再印刷'}
          </Button>
        </div>
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
            {detail.data !== undefined &&
              detail.data.printJobs.length > 0 &&
              detail.data.printJobs
                .slice()
                .reverse()
                .map((job) => (
                  <div
                    className="flex flex-col gap-2 border-b pb-3 last:border-0 last:pb-0"
                    key={job.id}
                  >
                    <PrintJobControls
                      disabled={actionPending}
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
