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
            Linux の受付 PC に合うバイナリを、
            <a
              className="underline"
              href={AGENT_SETUP_LINKS.releases}
              target="_blank"
              rel="noreferrer"
            >
              GitHub Releases
            </a>
            から入手してください。
          </li>
          <li>
            ソースからビルドする場合は、エージェントの README にある{' '}
            <a
              className="underline"
              href={`${AGENT_SETUP_LINKS.agentReadme}#build-and-test`}
              target="_blank"
              rel="noreferrer"
            >
              README の「Build and test」節
            </a>
            を参照してください。
          </li>
          <li>
            プリンター一覧で printerId
            を確認します。各エージェント行の「設定テンプレート」、またはトークン発行・再発行直後のパネルから、利用するドライバーを選んで
            <code>print-agent.json</code> をダウンロードします。
          </li>
          <li>
            発行直後のパネルで環境変数の雛形をコピーし、受付 PC
            の保護された環境変数ファイルに保存します。雛形には現在の origin
            を使う <code>API_BASE_URL</code> と <code>AGENT_TOKEN</code>
            が含まれ、発行直後だけ実トークンが入ります。パネルを閉じた後はトークンを再表示できないため、先に保存してください。
            <code>PRINT_AGENT_CONFIG_PATH</code> は設定 JSON の絶対パスです。
          </li>
          <li>
            systemd
            などに登録してエージェントを起動し、この画面の「最終接続」が更新されることを確認します。
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
