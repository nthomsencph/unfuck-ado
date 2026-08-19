import { apiFetch, orgBase, projectBase, type ApiResult } from "../../core/api";
import { log } from "../../core/log";
import { refKey, type PrRef } from "./threads-api";

/**
 * ADO persists "Mark as reviewed" per user through the
 * ms.vss-code-web.pr-detail-visit-data-provider contribution (captured live
 * 2026-08-02). Its viewedState is a JSON string of the form
 *   {"hashes":{"1@<HASH8>@</file/path>": <status>, ...}}
 * where status 2 = viewed (a click that unmarks DELETES the entry). The 8-hex
 * hash is computed by ADO's client from something we could not reproduce
 * (tried CRC32/CRC32C/FNV/murmur/xxhash over path/objectIds — no match), and
 * the server stores keys opaquely while the UI matches them EXACTLY (a forged
 * hash is stored but ignored by the checkbox rendering). So this module only
 * READS state — writes go through clicking ADO's real tree checkbox, letting
 * their code mint the key.
 */

const VISIT_PROVIDER = "ms.vss-code-web.pr-detail-visit-data-provider";
/** The version ADO's own frontend requests the contribution API with. */
const HIERARCHY_QUERY_API = "5.0-preview.1";

interface HierarchyQueryResponse {
  dataProviders?: Record<string, { visit?: { viewedState?: string } } | undefined>;
}

/**
 * Paths marked viewed, parsed out of the hash keys ("1@E790AC37@/a/b.py" →
 * "/a/b.py"). Bad keys and non-2 statuses are skipped.
 */
export function parseViewedState(viewedState: string | undefined): Set<string> {
  const viewed = new Set<string>();
  if (!viewedState) return viewed;
  let hashes: Record<string, number>;
  try {
    hashes = (JSON.parse(viewedState) as { hashes?: Record<string, number> }).hashes ?? {};
  } catch {
    return viewed;
  }
  for (const [key, status] of Object.entries(hashes)) {
    if (status !== 2) continue;
    const secondAt = key.indexOf("@", key.indexOf("@") + 1);
    if (secondAt < 0) continue;
    const path = key.slice(secondAt + 1);
    if (path.startsWith("/")) viewed.add(path);
  }
  return viewed;
}

// The provider wants the repository GUID; resolve the route's repo name once.
const repoIdCache = new Map<string, string>();

async function resolveRepoId(ref: PrRef): Promise<ApiResult<string>> {
  const cacheKey = `${ref.org}/${ref.project}/${ref.repo}`;
  const cached = repoIdCache.get(cacheKey);
  if (cached) return { ok: true, value: cached };
  const res = await apiFetch<{ id: string }>(
    `${projectBase(ref)}/_apis/git/repositories/${encodeURIComponent(ref.repo)}`
  );
  if (!res.ok) return res;
  repoIdCache.set(cacheKey, res.value.id);
  return { ok: true, value: res.value.id };
}

/** Current viewed-file paths for this PR, straight from the server. */
export async function fetchViewedPaths(ref: PrRef): Promise<ApiResult<Set<string>>> {
  const repoId = await resolveRepoId(ref);
  if (!repoId.ok) return repoId;
  const res = await apiFetch<HierarchyQueryResponse>(
    `${orgBase(ref.org)}/_apis/Contribution/HierarchyQuery/project/` +
      `${encodeURIComponent(ref.project)}?api-version=${HIERARCHY_QUERY_API}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contributionIds: [VISIT_PROVIDER],
        dataProviderContext: {
          properties: { repositoryId: repoId.value, pullRequestId: Number(ref.prId) },
        },
      }),
    }
  );
  if (!res.ok) return res;
  return {
    ok: true,
    value: parseViewedState(res.value.dataProviders?.[VISIT_PROVIDER]?.visit?.viewedState),
  };
}

// ---- shared live slot -------------------------------------------------------
// One viewed-paths set per PR, shared by pr-reviewed (checkbox mirrors) and
// pr-review-flow (progress + navigation). Deliberately NOT core/fetch-cache:
// the set is optimistically patched on toggle and refetched while the stale
// value keeps rendering — a live-synced value, not a fetch-once cache.

let slotKey: string | null = null;
let slotPaths: Set<string> | null = null;
let slotInFlight = false;
let slotFailed = false;

function ensureKey(ref: PrRef): void {
  const key = refKey(ref);
  if (key === slotKey) return;
  slotKey = key;
  slotPaths = null;
  slotInFlight = false;
  slotFailed = false;
}

function startFetch(ref: PrRef, onFresh?: () => void): void {
  slotInFlight = true;
  const startedFor = slotKey;
  void fetchViewedPaths(ref).then((res) => {
    slotInFlight = false;
    if (startedFor !== slotKey) return; // PR changed mid-flight
    if (!res.ok) {
      // Stand down for this page load; rendered tree rows still sync UIs.
      slotFailed = true;
      log("pr/reviewed-data", "viewed-state fetch failed", res.error);
      return;
    }
    slotPaths = res.value;
    onFresh?.();
  });
}

/**
 * The current PR's viewed-paths set, or null while unknown. Starts the fetch
 * when needed; onFresh fires when a fetch lands (callers re-apply then).
 */
export function viewedState(ref: PrRef, onFresh?: () => void): Set<string> | null {
  ensureKey(ref);
  if (slotPaths === null && !slotInFlight && !slotFailed) startFetch(ref, onFresh);
  return slotPaths;
}

/** Optimistic local patch after a toggle click, plus a background resync. */
export function patchViewed(ref: PrRef, path: string, viewed: boolean): void {
  ensureKey(ref);
  if (slotPaths) {
    if (viewed) slotPaths.add(path);
    else slotPaths.delete(path);
  }
  slotFailed = false;
  if (!slotInFlight) startFetch(ref);
}
