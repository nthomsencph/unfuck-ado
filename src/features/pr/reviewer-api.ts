import { apiFetch, orgBase, projectBase, type ApiResult } from "../../core/api";
import type { PrRef } from "./threads-api";
import type { ChangeEntry } from "./diff-totals-api";

/**
 * Who is reviewing this PR, how they voted, and what changed since.
 * All verified live 2026-08-19:
 * - `{org}/_apis/connectionData` returns the signed-in identity
 *   (authenticatedUser.id, a GUID) on the session cookie alone.
 * - PR details (`pullRequests/{id}?api-version=7.1`) carry `reviewers[]`
 *   with { id, vote, isRequired, isContainer } — ids compare directly
 *   against connectionData's. Groups/teams come as isContainer entries;
 *   a member who hasn't voted individually is NOT matched (known limit).
 * - Votes: 10 approved, 5 approved with suggestions, 0 none,
 *   -5 waiting for author, -10 rejected.
 */

export interface Reviewer {
  id: string;
  vote: number;
  isContainer?: boolean;
}

/** The user's vote, or null when they are not an assigned reviewer. */
export function myVote(reviewers: readonly Reviewer[], myId: string | null): number | null {
  if (!myId) return null;
  const me = reviewers.find((r) => !r.isContainer && r.id === myId);
  return me ? me.vote : null;
}

/** Quiet label for a cast vote; null for vote 0 (the flow labels that). */
export function voteLabel(vote: number): string | null {
  switch (vote) {
    case 10:
      return "Approved ✓";
    case 5:
      return "Approved · suggestions";
    case -5:
      return "Waiting for author";
    case -10:
      return "Rejected ✕";
    default:
      return null;
  }
}

/**
 * File paths touched by a set of change entries. Deletes carry only
 * originalPath (verified live 2026-08-02); folders are skipped.
 */
export function changedPaths(entries: readonly ChangeEntry[]): Set<string> {
  const paths = new Set<string>();
  for (const entry of entries) {
    if (entry.item?.isFolder) continue;
    const path = entry.item?.path ?? entry.originalPath;
    if (path) paths.add(path);
  }
  return paths;
}

let cachedUserId: string | null | undefined;

/** The signed-in user's identity GUID; cached for the page's lifetime. */
export async function fetchCurrentUserId(org: string): Promise<string | null> {
  if (cachedUserId !== undefined) return cachedUserId;
  const res = await apiFetch<{ authenticatedUser?: { id?: string } }>(
    `${orgBase(org)}/_apis/connectionData`
  );
  if (!res.ok) return null; // transient failure — stays uncached, retried later
  cachedUserId = res.value.authenticatedUser?.id ?? null;
  return cachedUserId;
}

function repoApiBase(ref: PrRef): string {
  return `${projectBase(ref)}/_apis/git/repositories/${encodeURIComponent(ref.repo)}`;
}

export interface ReviewSnapshot {
  reviewers: Reviewer[];
  latestIteration: number;
}

/** Reviewers + the latest iteration id, in one round of calls. */
export async function fetchReviewSnapshot(ref: PrRef): Promise<ApiResult<ReviewSnapshot>> {
  const [pr, iterations] = await Promise.all([
    apiFetch<{ reviewers?: Reviewer[] }>(
      `${repoApiBase(ref)}/pullRequests/${ref.prId}?api-version=7.1`
    ),
    apiFetch<{ value: Array<{ id: number }> }>(
      `${repoApiBase(ref)}/pullRequests/${ref.prId}/iterations`
    ),
  ]);
  if (!pr.ok) return pr;
  if (!iterations.ok) return iterations;
  const latest = iterations.value.value[iterations.value.value.length - 1]?.id ?? 0;
  return { ok: true, value: { reviewers: pr.value.reviewers ?? [], latestIteration: latest } };
}

/** Files changed between iteration `base` and the latest one. */
export async function fetchChangedSince(
  ref: PrRef,
  base: number,
  latest: number
): Promise<ApiResult<Set<string>>> {
  const entries: ChangeEntry[] = [];
  const pageSize = 1000;
  for (let skip = 0; ; skip += pageSize) {
    const page = await apiFetch<{ changeEntries?: ChangeEntry[] }>(
      `${repoApiBase(ref)}/pullRequests/${ref.prId}/iterations/${latest}/changes` +
        `?compareTo=${base}&$top=${pageSize}&$skip=${skip}`
    );
    if (!page.ok) return page;
    const batch = page.value.changeEntries ?? [];
    entries.push(...batch);
    if (batch.length < pageSize) break;
  }
  return { ok: true, value: changedPaths(entries) };
}
