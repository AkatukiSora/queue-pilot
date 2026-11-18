import { useId, useMemo, useState } from 'react';
import { inputClass } from './ui.tsx';
import {
  buildZoneIndex,
  filterZones,
  initialZones,
  listTimeZones,
  type ZoneOption,
} from './zone-search.ts';

let cachedIndex: { ids: string[]; index: ZoneOption[] } | undefined;
function zoneIndex() {
  if (cachedIndex === undefined) {
    const ids = listTimeZones();
    cachedIndex = { ids, index: buildZoneIndex(ids) };
  }
  return cachedIndex;
}

/**
 * 入力しながら絞り込むタイムゾーンの combobox (WAI-ARIA 1.2 の list autocomplete)。
 * 値は入力中の文字列そのもので、IANA 名としての検証は呼び出し側が行う。
 */
export function TimeZoneCombobox({
  label,
  hint,
  name,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  name: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(false);
  const [active, setActive] = useState(0);

  const options = useMemo(() => {
    const { ids, index } = zoneIndex();
    return typed && value.trim() !== ''
      ? filterZones(index, value)
      : initialZones(Intl.DateTimeFormat().resolvedOptions().timeZone, ids);
  }, [typed, value]);
  const expanded = open && options.length > 0;
  const activeIndex = Math.min(active, options.length - 1);

  const choose = (zone: string) => {
    onChange(zone);
    setTyped(false);
    setOpen(false);
  };

  return (
    <div className="grid gap-1 text-sm">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            expanded ? `${id}-option-${activeIndex}` : undefined
          }
          className={inputClass}
          value={value}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setOpen(false);
            setTyped(false);
          }}
          onChange={(event) => {
            setTyped(true);
            setOpen(true);
            setActive(0);
            onChange(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              if (!expanded) {
                setOpen(true);
                return;
              }
              const step = event.key === 'ArrowDown' ? 1 : -1;
              setActive((activeIndex + step + options.length) % options.length);
            } else if (event.key === 'Enter' && expanded) {
              event.preventDefault();
              const zone = options[activeIndex];
              if (zone !== undefined) choose(zone);
            } else if (event.key === 'Escape' && expanded) {
              event.preventDefault();
              setOpen(false);
            }
          }}
        />
        <div
          id={listId}
          role="listbox"
          aria-label={`${label}の候補`}
          hidden={!expanded}
          className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-background shadow-md"
        >
          {options.map((zone, position) => (
            <div
              key={zone}
              id={`${id}-option-${position}`}
              role="option"
              tabIndex={-1}
              aria-selected={position === activeIndex}
              className={
                position === activeIndex
                  ? 'cursor-pointer bg-accent px-3 py-2'
                  : 'cursor-pointer px-3 py-2'
              }
              // blur より先に選択を確定させるため mousedown を使う。
              onMouseDown={(event) => {
                event.preventDefault();
                choose(zone);
              }}
            >
              {zone}
            </div>
          ))}
        </div>
      </div>
      {hint !== undefined && (
        <span className="text-muted-foreground">{hint}</span>
      )}
    </div>
  );
}
