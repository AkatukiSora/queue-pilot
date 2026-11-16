import { expect, it } from 'vitest';
import { githubSubject } from './github-oauth.ts';

it('preserves GitHub numeric subjects as decimal strings', () => {
  expect(githubSubject({ id: 1234567 })).toBe('1234567');
  expect(githubSubject({ id: '1234567' })).toBe('1234567');
});

it('rejects GitHub profiles without an immutable numeric account ID', () => {
  for (const id of [
    null,
    0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    '',
    '0',
    '12.3',
    ' 123',
  ]) {
    expect(() => githubSubject({ id })).toThrow(
      'GitHub OAuth profile has no immutable numeric user ID.',
    );
  }
});
