export type AuthRateLimitHousekeeping = {
  isHealthy: () => boolean;
  stop: () => Promise<void>;
};

export async function startAuthRateLimitHousekeeping(options: {
  intervalMs: number;
  pruneExpiredRateLimits: () => Promise<void>;
}): Promise<AuthRateLimitHousekeeping> {
  await options.pruneExpiredRateLimits();

  let healthy = true;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | undefined;

  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(() => {
      timer = undefined;
      inFlight = (async () => {
        try {
          await options.pruneExpiredRateLimits();
          healthy = true;
        } catch {
          healthy = false;
          console.error({ event: 'auth_rate_limit_housekeeping_failed' });
        } finally {
          inFlight = undefined;
          schedule();
        }
      })();
    }, options.intervalMs);
    timer.unref();
  };

  schedule();

  return {
    isHealthy: () => healthy,
    stop: async () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      await inFlight;
    },
  };
}
