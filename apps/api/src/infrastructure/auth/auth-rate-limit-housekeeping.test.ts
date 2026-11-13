import { afterEach, describe, expect, it, vi } from 'vitest';
import { startAuthRateLimitHousekeeping } from './auth-rate-limit-housekeeping.ts';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('startAuthRateLimitHousekeeping', () => {
  it('awaits startup cleanup and schedules the next sweep after completion', async () => {
    vi.useFakeTimers();
    const pruneExpiredRateLimits = vi.fn(async () => {});
    const housekeeping = await startAuthRateLimitHousekeeping({
      intervalMs: 60_000,
      pruneExpiredRateLimits,
    });

    expect(pruneExpiredRateLimits).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(pruneExpiredRateLimits).toHaveBeenCalledTimes(2);
    expect(housekeeping.isHealthy()).toBe(true);

    await housekeeping.stop();
  });

  it('marks failed sweeps unhealthy and recovers after the next successful sweep', async () => {
    vi.useFakeTimers();
    const pruneExpiredRateLimits = vi
      .fn<() => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('database failure'))
      .mockResolvedValue(undefined);
    const logFailure = vi.spyOn(console, 'error').mockImplementation(() => {});
    const housekeeping = await startAuthRateLimitHousekeeping({
      intervalMs: 60_000,
      pruneExpiredRateLimits,
    });

    await vi.advanceTimersByTimeAsync(60_000);
    expect(housekeeping.isHealthy()).toBe(false);
    expect(logFailure).toHaveBeenCalledWith({
      event: 'auth_rate_limit_housekeeping_failed',
    });

    await vi.advanceTimersByTimeAsync(60_000);
    expect(housekeeping.isHealthy()).toBe(true);
    await housekeeping.stop();
  });

  it('waits for an active sweep during stop and does not schedule another', async () => {
    vi.useFakeTimers();
    let finishSweep: (() => void) | undefined;
    const activeSweep = new Promise<void>((resolve) => {
      finishSweep = resolve;
    });
    const pruneExpiredRateLimits = vi
      .fn<() => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(() => activeSweep);
    const housekeeping = await startAuthRateLimitHousekeeping({
      intervalMs: 60_000,
      pruneExpiredRateLimits,
    });

    await vi.advanceTimersByTimeAsync(60_000);
    const stopping = housekeeping.stop();
    let stopped = false;
    void stopping.then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);

    finishSweep?.();
    await stopping;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(pruneExpiredRateLimits).toHaveBeenCalledTimes(2);
  });

  it('rejects startup when the first cleanup fails', async () => {
    vi.useFakeTimers();
    const pruneExpiredRateLimits = vi
      .fn<() => Promise<void>>()
      .mockRejectedValue(new Error('database failure'));

    await expect(
      startAuthRateLimitHousekeeping({
        intervalMs: 60_000,
        pruneExpiredRateLimits,
      }),
    ).rejects.toThrow('database failure');
    expect(vi.getTimerCount()).toBe(0);
  });
});
