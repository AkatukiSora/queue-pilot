import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import credits from '../../generated/credits.json';
import { CreditsScreen } from './credits-screen.tsx';

describe('CreditsScreen', () => {
  it('shows generated Web and Go dependencies with full license text and safe links', () => {
    render(<CreditsScreen />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: '使用ライブラリのクレジット',
      }),
    ).toBeDefined();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Web（本番依存）' }),
    ).toBeDefined();
    expect(
      screen.getByRole('heading', { level: 2, name: 'API（本番依存）' }),
    ).toBeDefined();
    expect(
      screen.getByRole('heading', { level: 2, name: '印刷エージェント（Go）' }),
    ).toBeDefined();

    const hono = credits.api.find((dependency) => dependency.name === 'hono');
    expect(hono).toBeDefined();

    for (const [sectionTitle, dependency] of [
      ['Web（本番依存）', credits.web[0]],
      ['API（本番依存）', hono],
      ['印刷エージェント（Go）', credits.printAgent[0]],
    ] as const) {
      const section = within(
        screen.getByRole('region', { name: sectionTitle }),
      );
      const heading = section.getByRole('heading', {
        level: 3,
        name: `${dependency?.name}@${dependency?.version}`,
      });
      const item = heading.closest('li');
      expect(item).not.toBeNull();
      const packageView = within(item as HTMLElement);
      expect(
        packageView.getByText(`ライセンス: ${dependency?.license}`),
      ).toBeDefined();
      const licenseDisclosure = packageView
        .getByText(`ライセンス全文（${dependency?.license}）`)
        .closest('details');
      expect(licenseDisclosure?.querySelector('pre')?.textContent).toBe(
        dependency?.licenseText,
      );
      for (const link of packageView.getAllByRole('link')) {
        expect(link.getAttribute('rel')).toBe('noopener noreferrer');
      }
    }
  });
});
