const REPOSITORY_URL = 'https://github.com/AkatukiSora/queue-pilot';

export const AGENT_SETUP_LINKS = {
  releases: `${REPOSITORY_URL}/releases/latest`,
  agentReadme: `${REPOSITORY_URL}/blob/main/apps/print-agent/README.md`,
  gettingStarted: `${REPOSITORY_URL}/blob/main/docs/getting-started.md`,
} as const;

/** 印刷エージェントの入手とセットアップの案内。折りたたんで表示する。 */
export function AgentSetupGuide() {
  return (
    <details className="rounded-lg border p-3 text-sm">
      <summary className="cursor-pointer font-semibold">
        エージェントの入手とセットアップ手順
      </summary>
      <div className="mt-3 grid gap-3">
        <ol className="list-decimal pl-5">
          <li>
            <a
              className="underline"
              href={AGENT_SETUP_LINKS.releases}
              target="_blank"
              rel="noreferrer"
            >
              GitHub Releases の最新版
            </a>
            から、受付 PC に合うエージェントのバイナリを入手します。
          </li>
          <li>
            環境変数 <code>API_BASE_URL</code> (このサービスの URL) と{' '}
            <code>AGENT_TOKEN</code> (上で発行したトークン)
            を設定します。トークンは環境変数ファイルなどに保存し、他の人に見せないでください。
          </li>
          <li>
            systemd などのサービスとして登録し、PC の起動後も常駐させます。
          </li>
          <li>
            起動後に、この画面のトークン一覧で「最終接続」が更新されることを確認します。
          </li>
        </ol>
        <p>
          詳しい手順:{' '}
          <a
            className="underline"
            href={AGENT_SETUP_LINKS.agentReadme}
            target="_blank"
            rel="noreferrer"
          >
            エージェントの README
          </a>
          {' / '}
          <a
            className="underline"
            href={AGENT_SETUP_LINKS.gettingStarted}
            target="_blank"
            rel="noreferrer"
          >
            はじめに (getting-started)
          </a>
        </p>
      </div>
    </details>
  );
}
