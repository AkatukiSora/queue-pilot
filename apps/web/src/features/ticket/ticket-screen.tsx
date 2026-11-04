import { AlertCircle, Clock3, TicketCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card.tsx';
import { usePublicTicket } from './public-ticket.ts';

type TicketStatus = 'waiting' | 'called' | 'served' | 'cancelled';

const statusCopy: Record<TicketStatus, string> = {
  waiting: '順番をお待ちください',
  called: 'あなたの番号をお呼びしています',
  served: 'ご案内は完了しました',
  cancelled: 'この整理券はキャンセルされています',
};

const statusVariant: Record<
  TicketStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  waiting: 'secondary',
  called: 'default',
  served: 'outline',
  cancelled: 'destructive',
};

export function TicketScreen({ token }: { token: string }) {
  const ticketQuery = usePublicTicket(token);

  if (ticketQuery.isPending) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-4 py-8">
        <Card className="w-full text-center" aria-busy="true">
          <CardHeader>
            <CardTitle>整理券を確認しています</CardTitle>
            <CardDescription>状況を読み込んでいます。</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  if (ticketQuery.isError) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-4 py-8">
        <Card className="w-full text-center">
          <CardHeader>
            <AlertCircle
              className="mx-auto size-10 text-destructive"
              aria-hidden="true"
            />
            <CardTitle>状況を取得できません</CardTitle>
            <CardDescription>
              通信を確認して、もう一度お試しください。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => void ticketQuery.refetch()}>
              再読み込み
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const result = ticketQuery.data;
  if (result.kind === 'not-found') {
    return (
      <MessageScreen
        icon={<TicketCheck className="size-10" aria-hidden="true" />}
        title="整理券が見つかりません"
        description="QRコードまたはURLをご確認ください。"
      />
    );
  }
  if (result.kind === 'expired') {
    return (
      <MessageScreen
        icon={<Clock3 className="size-10" aria-hidden="true" />}
        title="整理券の有効期限が終了しました"
        description="この整理券の状況は確認できません。"
      />
    );
  }

  const { ticket } = result;
  const slotReleased =
    ticket.reservation.kind === 'slot' &&
    'slotReleasedAt' in ticket &&
    typeof ticket.slotReleasedAt === 'string';
  const timeChanged =
    ticket.latestChange !== null &&
    ticket.latestChange.from.kind === 'slot' &&
    ticket.latestChange.from.slotStartsAt !==
      ticket.latestChange.to.slotStartsAt;
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-4 py-8">
      <Card className="w-full overflow-hidden">
        <CardHeader className="items-center text-center">
          <div className="mb-2 rounded-full bg-primary/10 p-3 text-primary">
            <TicketCheck className="size-8" aria-hidden="true" />
          </div>
          <CardDescription>文化祭 整理券</CardDescription>
          <CardTitle className="text-2xl">あなたの番号</CardTitle>
          <p className="text-7xl font-bold tracking-tight tabular-nums">
            {ticket.number}
            <span className="ml-1 text-3xl font-semibold">番</span>
          </p>
          <Badge
            variant={
              slotReleased ? 'destructive' : statusVariant[ticket.status]
            }
          >
            {slotReleased ? '枠解放済み' : statusCopy[ticket.status]}
          </Badge>
        </CardHeader>
        {slotReleased && (
          <CardContent
            className="border-y border-destructive/40 bg-destructive/5 p-5 text-center"
            role="alert"
          >
            <p className="text-lg font-bold">
              この枠は解放済みです。現在の予約はありません。
            </p>
          </CardContent>
        )}
        {ticket.reservation.kind === 'slot' ? (
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border bg-muted/40 p-4 text-center">
              <p className="text-sm text-muted-foreground">
                {slotReleased ? '解放前の予約' : '予約日時'}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {formatJstDate(ticket.reservation.slotStartsAt)}
              </p>
              <p className="text-xl font-semibold tabular-nums">
                {formatJstTime(ticket.reservation.slotStartsAt)}〜
                {formatJstTime(ticket.reservation.experienceEndsAt)}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">体験時間</p>
              <p className="text-sm tabular-nums">
                交代終了 {formatJstTime(ticket.reservation.endsAt)}
              </p>
            </div>
            <div className="rounded-lg border bg-muted/40 p-4 text-center">
              <p className="text-sm text-muted-foreground">ご利用機材</p>
              <p className="mt-1 text-xl font-semibold">
                {ticket.reservation.equipment}
              </p>
            </div>
          </CardContent>
        ) : (
          <CardContent className="text-center">
            <p className="font-semibold">旧整理券・スタッフにご確認ください</p>
          </CardContent>
        )}
        {ticket.latestChange !== null && (
          <CardContent className="grid gap-3 border-t bg-primary/5 p-5">
            <h2 className="text-lg font-bold">
              時間枠または機材が変更されました
            </h2>
            <dl className="grid gap-2 text-sm sm:grid-cols-[auto_1fr]">
              <dt className="font-semibold">変更前</dt>
              <dd>{formatReservation(ticket.latestChange.from)}</dd>
              <dt className="font-semibold">変更後</dt>
              <dd>{formatReservation(ticket.latestChange.to)}</dd>
              <dt className="font-semibold">変更日時</dt>
              <dd>{formatJstDateTime(ticket.latestChange.changedAt)}</dd>
            </dl>
            {ticket.latestChange.comment !== null && (
              <div className="rounded-md border bg-background p-3">
                <p className="text-sm font-semibold">スタッフからのコメント</p>
                <p className="mt-1 whitespace-pre-wrap break-words">
                  {ticket.latestChange.comment}
                </p>
              </div>
            )}
            {timeChanged && (
              <p className="font-semibold" role="status">
                紙ではなく、現在表示されている予約時刻をご確認ください。
              </p>
            )}
          </CardContent>
        )}
        <p className="px-6 pb-5 text-center text-xs text-muted-foreground">
          状況は自動で更新されます。
        </p>
      </Card>
    </main>
  );
}

function formatJstParts(value: string) {
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
  const parts = formatJstParts(value);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatJstTime(value: string) {
  const parts = formatJstParts(value);
  return `${parts.hour}:${parts.minute}`;
}

function formatJstDateTime(value: string) {
  return `${formatJstDate(value)} ${formatJstTime(value)} (JST)`;
}

function formatReservation(
  reservation:
    | { kind: 'legacy' }
    | {
        kind: 'slot';
        slotStartsAt: string;
        experienceEndsAt: string;
        equipment: string;
      },
) {
  if (reservation.kind === 'legacy') return '時間未割当の旧整理券';
  return `${formatJstDate(reservation.slotStartsAt)} ${formatJstTime(reservation.slotStartsAt)}〜${formatJstTime(reservation.experienceEndsAt)}・${reservation.equipment}`;
}

function MessageScreen({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-4 py-8">
      <Card className="w-full text-center">
        <CardHeader>
          <div className="mx-auto mb-2 text-muted-foreground">{icon}</div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
