import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { HelpTip } from '../../components/ui/help-tip.tsx';
import { AGENT_SETUP_LINKS, AgentSetupGuide } from '../agents/agent-setup.tsx';
import { TimeZoneCombobox } from './timezone-combobox.tsx';

afterEach(cleanup);

function Harness({ initial = 'Asia/Tokyo' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <TimeZoneCombobox
      label="タイムゾーン (IANA 名)"
      name="timeZone"
      value={value}
      onChange={setValue}
    />
  );
}

describe('TimeZoneCombobox', () => {
  it('shows the existing value without a full list, then filters as you type', () => {
    render(<Harness />);
    const input = screen.getByRole('combobox', {
      name: /^タイムゾーン/,
    }) as HTMLInputElement;
    expect(input.value).toBe('Asia/Tokyo');
    fireEvent.focus(input);
    expect(screen.getAllByRole('option').length).toBeLessThan(10);

    fireEvent.change(input, { target: { value: 'ニューヨーク' } });
    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toContain('America/New_York');
  });

  it('selects with the keyboard and closes with Escape', () => {
    render(<Harness initial="" />);
    const input = screen.getByRole('combobox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'auckland' } });
    expect(input.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.getAttribute('aria-expanded')).toBe('false');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('Pacific/Auckland');
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps free text so the caller can validate it', () => {
    render(<Harness />);
    const input = screen.getByRole('combobox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '+09:00' } });
    expect(input.value).toBe('+09:00');
  });
});

describe('HelpTip', () => {
  it('opens on focus, on click and with hover, and closes with Escape', () => {
    render(<HelpTip label="トークン">鍵です</HelpTip>);
    const button = screen.getByRole('button', { name: 'トークンの説明' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focus(button);
    expect(screen.getByRole('tooltip').textContent).toBe('鍵です');
    expect(
      screen.getByRole('tooltip').classList.contains('pointer-events-none'),
    ).toBe(true);
    expect(button.getAttribute('aria-describedby')).toBe(
      screen.getByRole('tooltip').id,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.click(button);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.click(button);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.mouseEnter(button);
    expect(screen.getByRole('tooltip')).toBeTruthy();
  });
});

describe('AgentSetupGuide', () => {
  it('links to the latest release and both guides', () => {
    render(<AgentSetupGuide />);
    const href = (name: RegExp) =>
      screen.getByRole('link', { name }).getAttribute('href');
    expect(href(/GitHub Releases/)).toBe(AGENT_SETUP_LINKS.releases);
    expect(AGENT_SETUP_LINKS.releases).toBe(
      'https://github.com/AkatukiSora/queue-pilot/releases/latest',
    );
    expect(href(/README/)).toBe(
      'https://github.com/AkatukiSora/queue-pilot/blob/main/apps/print-agent/README.md',
    );
    expect(href(/getting-started/)).toBe(
      'https://github.com/AkatukiSora/queue-pilot/blob/main/docs/getting-started.md',
    );
    expect(screen.getByText('API_BASE_URL')).toBeTruthy();
    expect(screen.getByText('AGENT_TOKEN')).toBeTruthy();
  });
});
