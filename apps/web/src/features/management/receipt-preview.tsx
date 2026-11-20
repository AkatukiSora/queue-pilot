const SAMPLE_RECEIPT = {
  number: '17',
  reservationDate: '2026-11-03',
  reservationStart: '15:30',
  issuedAt: '発券日時: 2026-11-03 14:45:06',
} as const;

export function ReceiptPreview({
  title,
  arrivalGuidance,
}: {
  title: string;
  arrivalGuidance: string;
}) {
  return (
    <div className="grid content-start gap-2">
      <section
        aria-label="レシートのプレビュー"
        className="mx-auto grid w-full max-w-xs gap-2 border bg-white px-5 py-5 font-mono text-sm text-gray-950 shadow-sm"
      >
        <h3 className="whitespace-pre-wrap break-words text-center font-bold">
          {title}
        </h3>
        <p className="whitespace-pre-wrap break-words text-center font-bold">
          <span className="sr-only">整理券番号: </span>
          <strong className="text-xl">{SAMPLE_RECEIPT.number}</strong>
        </p>
        <p className="whitespace-pre-wrap break-words text-center">
          予約日:{' '}
          <span className="text-xl">{SAMPLE_RECEIPT.reservationDate}</span>
        </p>
        <p className="whitespace-pre-wrap break-words text-center">
          開始:{' '}
          <span className="text-xl">{SAMPLE_RECEIPT.reservationStart}</span>
        </p>
        <p className="whitespace-pre-wrap break-words text-center">
          {arrivalGuidance}
        </p>
        <p className="whitespace-pre-wrap break-words text-center">
          {SAMPLE_RECEIPT.issuedAt}
        </p>
        <div
          role="img"
          aria-label="サンプルQRコード（読み取り不可）"
          className="mx-auto grid size-24 place-items-center border-4 border-double border-gray-950 bg-white text-xl font-bold"
        >
          <span aria-hidden="true">QR</span>
        </div>
      </section>
      <p className="text-xs text-muted-foreground">
        実機の用紙幅やプリンターの機種によって、改行位置が異なる場合があります。
      </p>
    </div>
  );
}
