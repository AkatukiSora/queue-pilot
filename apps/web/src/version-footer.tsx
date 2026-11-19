type VersionFooterProps = {
  version?: string;
};

export function VersionFooter({
  version = import.meta.env.VITE_APP_VERSION || 'unknown',
}: VersionFooterProps) {
  return (
    <footer className="px-4 py-2 text-center text-xs text-muted-foreground">
      Queue Pilot {version}
    </footer>
  );
}
