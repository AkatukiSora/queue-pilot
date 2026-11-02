import { describe, expect, it } from 'vitest';
import { printJobStatuses, transitionPrintJob } from './print-job.ts';

const validTransitions = new Set([
  'queued:printing',
  'printing:printed',
  'printing:failed',
  'printing:unknown',
]);
const transitionCases = printJobStatuses.flatMap((from) =>
  printJobStatuses.map((to) => ({ from, to })),
);

describe('transitionPrintJob', () => {
  it.each(transitionCases)('$from -> $to', ({ from, to }) => {
    const result = transitionPrintJob(from, to);

    if (validTransitions.has(`${from}:${to}`)) {
      expect(result).toEqual({ ok: true, value: to });
      return;
    }

    expect(result).toEqual({
      ok: false,
      error: { kind: 'InvalidTransition', from, action: to },
    });
  });
});
