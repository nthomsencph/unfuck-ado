import { getValue, setValue } from "../../core/storage";
import { fetchDiffTotalsAt, fetchLastIteration, formatLineCount } from "./diff-totals-api";
import type { PrRef } from "./threads-api";

/**
 * Per-PR diffstat for the PR list ("+120 / −30 · 4 changed files"), built
 * on pr-diff-totals' data path. A PR costs one iterations GET to learn its
 * latest commit, then — only when that commit isn't cached — the changes
 * listing and ⌈files/10⌉ filediffs POSTs. Results are cached by
 * `prId@sourceCommit` in userscript storage (a new push changes the key),
 * so a revisit costs one cheap request per row. Work runs through a small
 * queue so a 50-row list never floods the API.
 */

export interface DiffStat {
  adds: number;
  dels: number;
  files: number;
}

/** Cached entry; `t` (ms) orders pruning. */
export interface CachedStat extends DiffStat {
  t: number;
}

const FEATURE = "pr-list";
const CACHE_KEY = "diffstats";
const CACHE_MAX = 600;
/** PRs computed at once; each runs pr-diff-totals' own 4-wide POST pool. */
const PR_CONCURRENCY = 2;

/** GitHub's diffstat strings: "+120", "−30" (U+2212, D45), "4 changed files". */
export function diffstatParts(stat: DiffStat): { adds: string; dels: string; files: string } {
  return {
    adds: `+${formatLineCount(stat.adds)}`,
    dels: `−${formatLineCount(stat.dels)}`,
    files: `${stat.files} changed file${stat.files === 1 ? "" : "s"}`,
  };
}

/** Drops the oldest entries beyond `max`; same object when already under it. */
export function pruneOldest(
  map: Record<string, CachedStat>,
  max: number
): Record<string, CachedStat> {
  const keys = Object.keys(map);
  if (keys.length <= max) return map;
  const keep = keys.sort((a, b) => map[b]!.t - map[a]!.t).slice(0, max);
  return Object.fromEntries(keep.map((k) => [k, map[k]!]));
}

/** A run(task) that keeps at most `limit` tasks in flight, FIFO. */
export function createQueue(limit: number): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
    active++;
    try {
      return await task();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}

const queue = createQueue(PR_CONCURRENCY);

/** The PR's diffstat, or null if any request failed (no partial numbers). */
export function fetchDiffStat(ref: PrRef): Promise<DiffStat | null> {
  return queue(async () => {
    const last = await fetchLastIteration(ref);
    if (!last.ok) return null;
    const key = `${ref.prId}@${last.value.sourceRefCommit.commitId}`;
    const cached = getValue<Record<string, CachedStat>>(FEATURE, CACHE_KEY, {})[key];
    if (cached) return { adds: cached.adds, dels: cached.dels, files: cached.files };
    const totals = await fetchDiffTotalsAt(ref, last.value);
    if (!totals.ok) return null;
    const stat: DiffStat = { adds: 0, dels: 0, files: totals.value.files.length };
    for (const f of totals.value.files) {
      stat.adds += f.adds;
      stat.dels += f.dels;
    }
    // Re-read before writing: other PRs settle concurrently.
    const map = getValue<Record<string, CachedStat>>(FEATURE, CACHE_KEY, {});
    map[key] = { ...stat, t: Date.now() };
    setValue(FEATURE, CACHE_KEY, pruneOldest(map, CACHE_MAX));
    return stat;
  });
}
