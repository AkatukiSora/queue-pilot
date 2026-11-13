import { expect, it } from 'vitest';
import { githubSubject } from './github-oauth.ts';

it('preserves GitHub numeric subjects as decimal strings', () => {
  expect(githubSubject({ id: 1234567 })).toBe('1234567');
  expect(githubSubject({ id: '1234567' })).toBe('1234567');
});

it('rejects GitHub profiles without an immutable account ID', () => {
  expect(() => githubSubject({ id: null })).toThrow(
    'GitHub OAuth profile has no immutable numeric user ID.',
  );
});
