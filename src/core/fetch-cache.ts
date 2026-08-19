/**
 * Keyed fetch-once state machine for REST-backed features. apply() re-runs on
 * every route change and DOM settle, so a naive fetch-on-miss turns any
 * deterministic failure into a request flood (shipped in v0.6.0; reported by
 * the user within minutes). This cache is that guard, shared: a key is
 * claimed at most once, and a failure either latches for the page lifetime
 * (default) or is forgotten so a later pass retries.
 */
export interface FetchCacheOptions {
  /**
   * "latch" (default): a failed key stands down until reload.
   * "retry": a failed key is forgotten so a later begin() tries again — for
   * transient failures where a missing value is worse than a repeat request.
   */
  onFailure?: "latch" | "retry";
}

export interface FetchCache<K, V> {
  get(key: K): V | undefined;
  /** Settled, in flight, or latched-failed — i.e. fetching would be wrong. */
  known(key: K): boolean;
  /**
   * Claims keys for one fetch: marks them in flight and returns the subset
   * that was not already known. Callers fetch exactly what comes back.
   */
  begin(keys: Iterable<K>): K[];
  settle(key: K, value: V): void;
  /** Ends the keys' flight per the failure policy. */
  fail(keys: Iterable<K>): void;
}

export function createFetchCache<K, V>(options: FetchCacheOptions = {}): FetchCache<K, V> {
  const onFailure = options.onFailure ?? "latch";
  const values = new Map<K, V>();
  const inflight = new Set<K>();
  const failed = new Set<K>();
  const known = (key: K): boolean => values.has(key) || inflight.has(key) || failed.has(key);
  return {
    get: (key) => values.get(key),
    known,
    begin(keys) {
      const claimed: K[] = [];
      for (const key of keys) {
        if (known(key)) continue;
        inflight.add(key);
        claimed.push(key);
      }
      return claimed;
    },
    settle(key, value) {
      inflight.delete(key);
      failed.delete(key);
      values.set(key, value);
    },
    fail(keys) {
      for (const key of keys) {
        inflight.delete(key);
        if (onFailure === "latch") failed.add(key);
      }
    },
  };
}
