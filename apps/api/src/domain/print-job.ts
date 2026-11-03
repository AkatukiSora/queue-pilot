import type { InvalidTransition, Result } from './result.ts';

export const printJobStatuses = [
  'queued',
  'printing',
  'printed',
  'failed',
  'unknown',
] as const;
export type PrintJobStatus = (typeof printJobStatuses)[number];

export function transitionPrintJob(
  from: PrintJobStatus,
  to: PrintJobStatus,
): Result<PrintJobStatus, InvalidTransition> {
  if (from === 'queued' && to === 'printing') return { ok: true, value: to };
  if (
    from === 'printing' &&
    (to === 'printed' || to === 'failed' || to === 'unknown')
  ) {
    return { ok: true, value: to };
  }

  return {
    ok: false,
    error: { kind: 'InvalidTransition', from, action: to },
  };
}
