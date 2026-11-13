export function githubSubject(profile: Record<string, unknown>): string {
  const subject = profile.id;
  if (typeof subject !== 'number' && typeof subject !== 'string') {
    throw new Error('GitHub OAuth profile has no immutable numeric user ID.');
  }
  return String(subject);
}
