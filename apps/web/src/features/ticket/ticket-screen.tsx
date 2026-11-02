import { AlertCircle, Clock3, Megaphone, TicketCheck } from 'lucide-react';
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
          <Badge variant={statusVariant[ticket.status]}>
            {statusCopy[ticket.status]}
          </Badge>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border bg-muted/40 p-4 text-center">
            <p className="text-sm text-muted-foreground">前の待機人数</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">
              {ticket.aheadInQueue}
              <span className="ml-1 text-base font-normal">人</span>
            </p>
          </div>
          <div className="rounded-lg border bg-muted/40 p-4 text-center">
            <p className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
              <Megaphone className="size-4" aria-hidden="true" />
              最新の呼出番号
            </p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">
              {ticket.latestCalledNumber ?? '—'}
              {ticket.latestCalledNumber !== null && (
                <span className="ml-1 text-base font-normal">番</span>
              )}
            </p>
          </div>
        </CardContent>
        <p className="px-6 pb-5 text-center text-xs text-muted-foreground">
          状況は自動で更新されます。
        </p>
      </Card>
    </main>
  );
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
