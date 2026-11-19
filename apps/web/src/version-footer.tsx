type VersionFooterProps = {
  version?: string;
};

export function VersionFooter({
  version = import.meta.env.VITE_APP_VERSION || 'unknown',
}: VersionFooterProps) {
  return (
    <footer className="px-4 py-2 text-center text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <span>Queue Pilot {version}</span>
        <a
          href="https://github.com/AkatukiSora/queue-pilot"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
        <a href="/credits">ライセンス / クレジット</a>
      </div>
    </footer>
  );
}
