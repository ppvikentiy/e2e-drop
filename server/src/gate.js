// Attempt limit for password-protected drops (VDE2 gate token). The server never sees the password;
// it compares a hash of the gate token. Wrong attempts slow down further attempts with a growing
// delay, counted per drop and IP and per IP across all drops. There is no hard lock, so a stranger
// holding the link cannot lock the real recipient out from another address.
// Counters live in memory: a restart clears them, which only resets the delay.

export const DEFAULTS = {
  freeAttempts: 5, // wrong attempts per drop and IP before any delay
  baseDelayMs: 2000, // first delay, doubled on every further wrong attempt
  maxDelayMs: 15 * 60 * 1000,
  resetAfterMs: 60 * 60 * 1000, // forget a counter after this long without a wrong attempt
  ipFreeAttempts: 30, // wrong attempts per IP across all drops within resetAfterMs
};

export function createGate(options = {}, now = () => Date.now()) {
  const opts = { ...DEFAULTS, ...options };
  const counters = new Map(); // key -> { fails, last }

  function entry(key) {
    const e = counters.get(key);
    if (e && now() - e.last > opts.resetAfterMs) {
      counters.delete(key);
      return null;
    }
    return e ?? null;
  }

  function delayFor(fails, free) {
    if (fails < free) return 0;
    return Math.min(opts.maxDelayMs, opts.baseDelayMs * 2 ** (fails - free));
  }

  function waitFor(key, free) {
    const e = entry(key);
    if (!e) return 0;
    return Math.max(0, e.last + delayFor(e.fails, free) - now());
  }

  return {
    /** Milliseconds the caller must wait before the next attempt is allowed (0 = allowed now). */
    retryAfter(dropId, ip) {
      return Math.max(waitFor(`d:${dropId}:${ip}`, opts.freeAttempts), waitFor(`ip:${ip}`, opts.ipFreeAttempts));
    },
    fail(dropId, ip) {
      for (const key of [`d:${dropId}:${ip}`, `ip:${ip}`]) {
        const e = entry(key) ?? { fails: 0, last: 0 };
        e.fails += 1;
        e.last = now();
        counters.set(key, e);
      }
    },
    succeed(dropId, ip) {
      counters.delete(`d:${dropId}:${ip}`);
    },
    /** Drops stale counters so memory stays bounded. */
    sweep() {
      for (const [key, e] of counters) if (now() - e.last > opts.resetAfterMs) counters.delete(key);
    },
    size: () => counters.size,
  };
}
