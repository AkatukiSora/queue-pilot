import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { emptyEventDraft } from './event-config.ts';
import { CopySection } from './event-form.tsx';

function CopySectionHarness() {
  const [draft, setDraft] = useState(() => emptyEventDraft('Asia/Tokyo'));
  return (
    <CopySection
      draft={draft}
      update={(patch) => setDraft((current) => ({ ...current, ...patch }))}
    />
  );
}

describe('CopySection', () => {
  it('updates an accessible receipt preview in print order as copy changes', () => {
    render(<CopySectionHarness />);

    const preview = screen.getByRole('region', {
      name: 'レシートのプレビュー',
    });
    fireEvent.change(screen.getByLabelText('レシートのタイトル'), {
      target: { value: '文化祭の整理券' },
    });
    const guidance = '受付でお声がけください。\n長い日本語の案内も続きます。';
    fireEvent.change(screen.getByLabelText('来場時の案内文'), {
      target: { value: guidance },
    });

    expect(
      screen.getByRole('heading', { name: '文化祭の整理券' }),
    ).toBeTruthy();
    expect(preview.textContent).toContain(guidance);
    expect(screen.getByText('17', { selector: 'strong' })).toBeTruthy();
    expect(screen.getByText('2026-11-03').closest('strong')).toBeNull();
    expect(screen.getByText('15:30').closest('strong')).toBeNull();
    expect(
      screen.getByRole('img', { name: 'サンプルQRコード（読み取り不可）' }),
    ).toBeTruthy();
    expect(screen.getByText(/実機の用紙幅やプリンターの機種/)).toBeTruthy();

    const content = preview.textContent ?? '';
    const printedParts = [
      '文化祭の整理券',
      '整理券番号',
      '17',
      '予約日: 2026-11-03',
      '開始: 15:30',
      guidance,
      '発券日時: 2026-11-03 14:45:06',
      'QR',
    ];
    const positions = printedParts.map((part) => content.indexOf(part));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});
