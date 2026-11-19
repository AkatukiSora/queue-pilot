import credits from '../../generated/credits.json';

type DependencyCredit = {
  name: string;
  version: string;
  license: string;
  repository: string | null;
  homepage: string | null;
  licenseUrl?: string;
  licenseFile: string;
  licenseText: string;
  notices: Array<{ file: string; text: string }>;
};

export function CreditsScreen() {
  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">使用ライブラリのクレジット</h1>
        <p className="text-sm text-muted-foreground">
          Queue Pilot の Web と API
          の本番依存、および印刷エージェントが使用するライブラリを掲載する。
        </p>
      </header>
      <CreditSection title="Web（本番依存）" dependencies={credits.web} />
      <CreditSection title="API（本番依存）" dependencies={credits.api} />
      <CreditSection
        title="印刷エージェント（Go）"
        dependencies={credits.printAgent}
      />
    </main>
  );
}

function CreditSection({
  title,
  dependencies,
}: {
  title: string;
  dependencies: DependencyCredit[];
}) {
  return (
    <section aria-label={title} className="space-y-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      <ul className="space-y-4">
        {dependencies.map((dependency) => (
          <li
            className="space-y-3 rounded-lg border bg-card p-4"
            key={`${dependency.name}@${dependency.version}`}
          >
            <h3 className="font-medium">
              {dependency.name}@{dependency.version}
            </h3>
            <p className="text-sm">ライセンス: {dependency.license}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
              {dependency.repository && (
                <ExternalLink
                  href={dependency.repository}
                  label={`リポジトリ: ${dependency.name}`}
                />
              )}
              {dependency.homepage && (
                <ExternalLink
                  href={dependency.homepage}
                  label={`ホームページ: ${dependency.name}`}
                />
              )}
              {'licenseUrl' in dependency && dependency.licenseUrl && (
                <ExternalLink
                  href={dependency.licenseUrl}
                  label={`ライセンス原文: ${dependency.name}`}
                />
              )}
            </div>
            <details>
              <summary className="cursor-pointer text-sm font-medium">
                ライセンス全文（{dependency.license}）
              </summary>
              <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-3 text-xs">
                {dependency.licenseText}
              </pre>
            </details>
            {dependency.notices.map((notice) => (
              <details key={notice.file}>
                <summary className="cursor-pointer text-sm font-medium">
                  追加の著作権表示（{notice.file}）
                </summary>
                <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-3 text-xs">
                  {notice.text}
                </pre>
              </details>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ExternalLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {label}
    </a>
  );
}
