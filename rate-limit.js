/**
 * TITAN WAR // RATE LIMITER UTILITY
 * In-memory sliding window rate limiter supporting custom clock injection for unit testing.
 */

class RateLimiter {
  constructor(options = {}) {
    this.limit = options.limit || 20;
    this.windowMs = options.windowMs || 60 * 1000;
    this.getTime = options.getTime || (() => Date.now());
    this.store = new Map();
  }

  check(key) {
    const now = this.getTime();
    let timestamps = this.store.get(key) || [];
    // Prune out-of-window timestamps
    timestamps = timestamps.filter(ts => (now - ts) < this.windowMs);
    this.store.set(key, timestamps);

    if (timestamps.length >= this.limit) {
      const oldest = timestamps[0];
      const retryAfter = Math.ceil((oldest + this.windowMs - now) / 1000);
      return { allowed: false, retryAfter: Math.max(1, retryAfter), remaining: 0 };
    }

    timestamps.push(now);
    return {
      allowed: true,
      retryAfter: 0,
      remaining: this.limit - timestamps.length
    };
  }

  reset(key) {
    if (key) {
      this.store.delete(key);
    } else {
      this.store.clear();
    }
  }
}

module.exports = { RateLimiter };
