import { useState } from 'react';
import { ApiError } from '../../api/api-error.ts';
import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent } from '../../components/ui/card.tsx';
import {
  type AgentCommand,
  type AgentScope,
  agentErrorMessage,
  type IssuedAgentToken,
  isUnknownOutcome,
  useAgentCommand,
  useAgents,
  useScopeRole,
} from './agents-api.ts';

/**
 * 印刷エージェントの再発行 (rotate) / 失効 (revoke)。admin にだけ表示する。
 * 表示の出し分けは利便のためで、認可の正本はサーバー (401/403/404) の応答。
 */
export function AgentsPanel({ scope }: { scope: AgentScope }) {
  const { role } = useScopeRole(scope);
  if (role !== 'admin') return null;
  return <AdminAgents scope={scope} />;
}

function AdminAgents({ scope }: { scope: AgentScope }) {
  const agents = useAgents(scope, true);
  const command = useAgentCommand(scope);
  const [confirming, setConfirming] = useState<AgentCommand | null>(null);
  const [unknownAgentId, setUnknownAgentId] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedAgentToken | null>(null);

  const run = (next: AgentCommand) => {
    setConfirming(null);
    setIssued(null);
    setUnknownAgentId(null);
    command.mutate(next, {
      onSuccess: (token) => setIssued(token),
      onError: (error) => {
        if (isUnknownOutcome(error)) setUnknownAgentId(next.agentId);
      },
    });
  };

  const listStatus =
    agents.error instanceof ApiError ? agents.error.status : undefined;
  const forbidden = listStatus === 403 || listStatus === 404;

  return (
    <Card>
      <CardContent className="grid gap-3 p-5">
        <h2 className="text-xl font-bold" id="agents-title">
          印刷エージェント
        </h2>
        {agents.isPending && <p aria-busy="true">読み込んでいます…</p>}
        {agents.isError && (
          <p role="alert">{agentErrorMessage(agents.error)}</p>
        )}
        {issued !== null && (
          <div className="grid gap-2 rounded-lg border p-4" role="status">
            <p className="font-semibold">
              新しいトークンを発行しました。この画面でのみ表示されます。
            </p>
            <code className="break-all">{issued.token}</code>
            <Button
              className="w-fit"
              variant="outline"
              onClick={() => setIssued(null)}
            >
              トークンを閉じる
            </Button>
          </div>
        )}
        {command.isError && (
          <div className="grid gap-2" role="alert">
            <p>{agentErrorMessage(command.error)}</p>
            {unknownAgentId !== null && (
              <Button
                className="w-fit"
                variant="outline"
                onClick={() => {
                  setUnknownAgentId(null);
                  void agents.refetch();
                }}
              >
                一覧を再読み込みして状態を確認
              </Button>
            )}
          </div>
        )}
        {!forbidden && (
          <ul className="grid gap-3" aria-labelledby="agents-title">
            {agents.data?.map((agent) => {
              const revoked = agent.revokedAt !== null;
              const blocked =
                command.isPending ||
                unknownAgentId === agent.id ||
                (confirming !== null && confirming.agentId !== agent.id);
              return (
                <li
                  key={agent.id}
                  className="grid gap-2 rounded-lg border p-3"
                  data-testid={`agent-${agent.id}`}
                >
                  <p className="font-semibold">
                    {agent.printerId}{' '}
                    {revoked && <Badge variant="outline">失効済み</Badge>}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    有効期限 {agent.expiresAt} / 最終接続{' '}
                    {agent.lastSeenAt ?? '未接続'}
                  </p>
                  {!revoked && confirming?.agentId !== agent.id && (
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        disabled={blocked}
                        onClick={() =>
                          setConfirming({ type: 'rotate', agentId: agent.id })
                        }
                      >
                        再発行
                      </Button>
                      <Button
                        variant="destructive"
                        disabled={blocked}
                        onClick={() =>
                          setConfirming({ type: 'revoke', agentId: agent.id })
                        }
                      >
                        失効
                      </Button>
                    </div>
                  )}
                  {confirming?.agentId === agent.id && (
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm">
                        {confirming.type === 'rotate'
                          ? 'トークンを再発行します。'
                          : 'このエージェントを失効します。'}
                      </p>
                      <Button
                        variant="destructive"
                        disabled={command.isPending}
                        onClick={() => run(confirming)}
                      >
                        {confirming.type === 'rotate'
                          ? '再発行を実行'
                          : '失効を実行'}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setConfirming(null)}
                      >
                        キャンセル
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
