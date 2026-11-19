import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VersionFooter } from './version-footer.tsx';

describe('VersionFooter', () => {
  it('shows the version, repository, and public credits links in the shared footer', () => {
    render(<VersionFooter version="1.2.3-rc.1+build.7" />);

    expect(screen.getByRole('contentinfo').textContent).toContain(
      'Queue Pilot 1.2.3-rc.1+build.7',
    );
    const github = screen.getByRole('link', { name: 'GitHub' });
    expect(github.getAttribute('href')).toBe(
      'https://github.com/AkatukiSora/queue-pilot',
    );
    expect(github.getAttribute('target')).toBe('_blank');
    expect(github.getAttribute('rel')).toBe('noopener noreferrer');
    expect(
      screen
        .getByRole('link', { name: 'ライセンス / クレジット' })
        .getAttribute('href'),
    ).toBe('/credits');
  });
});
