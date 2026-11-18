import { type ReactNode, useEffect, useId, useState } from 'react';

/**
 * 用語の短い説明を出すヘルプ。マウスの hover、キーボードの focus、
 * タッチやクリックでの固定表示のどれでも開き、Escape で閉じる。
 */
export function HelpTip({
  label,
  children,
}: {
  /** ボタンの読み上げ名。何についての説明かを示す。 */
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hover || focus || pinned;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setHover(false);
      setFocus(false);
      setPinned(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={`${label}の説明`}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        className="inline-flex size-6 items-center justify-center rounded-full border border-input text-xs font-bold text-muted-foreground"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setFocus(true)}
        onBlur={() => {
          setFocus(false);
          setPinned(false);
        }}
        onClick={() => setPinned((current) => !current)}
      >
        ?
      </button>
      {open && (
        <span
          role="tooltip"
          id={id}
          className="pointer-events-none absolute left-0 top-full z-10 mt-1 w-64 rounded-md border bg-background p-2 text-left text-xs font-normal shadow-md"
        >
          {children}
        </span>
      )}
    </span>
  );
}
