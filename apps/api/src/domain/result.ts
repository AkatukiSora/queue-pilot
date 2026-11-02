export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export type InvalidTransition = {
  kind: 'InvalidTransition';
  from: string;
  action: string;
};
