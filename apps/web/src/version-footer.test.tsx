import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VersionFooter } from './version-footer.tsx';

describe('VersionFooter', () => {
  it('shows the supplied application version in the shared footer', () => {
    render(<VersionFooter version="1.2.3-rc.1+build.7" />);

    expect(screen.getByRole('contentinfo').textContent).toContain(
      'Queue Pilot 1.2.3-rc.1+build.7',
    );
  });
});
