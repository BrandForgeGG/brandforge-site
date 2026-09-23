// Per-instance sliding-window rate limiter.
//
// Caveat: state lives in this Node process only. On serverless (Vercel) every
// instance keeps its own window, so this throttles bursty abuse per instance
// but is NOT a global quota. Durable limiting needs a shared store (Supabase
// table or Upstash) once the staging/migration flow exists (audit H8).

const buckets = new Map();
const MAX_TRACKED_KEYS = 5000;

function pruneKey(key, now, windowMs) {
  const hits = buckets.get(key);
  if (!hits) return [];
  const fresh = hits.filter((ts) => now - ts < windowMs);
  if (fresh.length === 0) {
    buckets.delete(key);
    return [];
  }
  buckets.set(key, fresh);
  return fresh;
}

function pruneAll(now, windowMs) {
  for (const [key, hits] of buckets) {
    const fresh = hits.filter((ts) => now - ts < windowMs);
    if (fresh.length === 0) buckets.delete(key);
    else buckets.set(key, fresh);
  }
}

/**
 * Record an attempt for `key` and decide whether it is allowed.
 *
 * @param {string} key    e.g. `chat:${userId}`
 * @param {{ limit: number, windowMs: number }} options
 * @returns {{ allowed: boolean, remaining: number, retryAfterSeconds: number }}
 */
function checkRateLimit(key, { limit, windowMs }) {
  const safeKey = String(key ?? '').slice(0, 200) || 'anonymous';
  const now = Date.now();

  // Bound memory: if the map grows past the cap, drop stale windows globally.
  if (buckets.size >= MAX_TRACKED_KEYS) {
    pruneAll(now, windowMs);
    if (buckets.size >= MAX_TRACKED_KEYS) {
      buckets.clear();
    }
  }

  const hits = pruneKey(safeKey, now, windowMs);

  if (hits.length >= limit) {
    const oldest = hits[0];
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    };
  }

  hits.push(now);
  buckets.set(safeKey, hits);

  return {
    allowed: true,
    remaining: limit - hits.length,
    retryAfterSeconds: 0,
  };
}

// Test hook: wipe all windows so cases stay independent.
function resetRateLimits() {
  buckets.clear();
}

module.exports = { checkRateLimit, resetRateLimits };
