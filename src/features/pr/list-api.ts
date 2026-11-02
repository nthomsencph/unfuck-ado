import { apiFetch, projectBase, type ApiResult, type ProjectRef } from "../../core/api";
import type { Reviewer } from "./reviewer-api";

/**
 * Active-PR ownership for the list page's "mine" tinting (verified live
 * 2026-08-20): `repositories/{repo}/pullrequests?searchCriteria.status=active`
 * returns `createdBy.id` and full `reviewers[]` per PR on plain 7.1, ids
 * comparable against connectionData's. Reviewer matching follows
 * reviewer-api's rule: individual, undeclined entries only.
 */

export interface RepoRef extends ProjectRef {
  repo: string;
}

export interface ListPr {
  pullRequestId: number;
  createdBy: { id: string };
  reviewers: Reviewer[];
}

export type Ownership = "author" | "reviewer";

/** prId → the user's relationship to it; PRs they're not on are absent. */
export function ownershipMap(prs: readonly ListPr[], myId: string): Map<number, Ownership> {
  const map = new Map<number, Ownership>();
  for (const pr of prs) {
    if (pr.createdBy.id === myId) map.set(pr.pullRequestId, "author");
    else if (pr.reviewers.some((r) => !r.isContainer && !r.hasDeclined && r.id === myId))
      map.set(pr.pullRequestId, "reviewer");
  }
  return map;
}

export async function fetchActivePrs(ref: RepoRef): Promise<ApiResult<ListPr[]>> {
  const res = await apiFetch<{ value: ListPr[] }>(
    `${projectBase(ref)}/_apis/git/repositories/${encodeURIComponent(ref.repo)}` +
      `/pullrequests?searchCriteria.status=active`
  );
  return res.ok ? { ok: true, value: res.value.value } : res;
}

/** Does the list have an item at index `skip`? null = the request failed. */
export type CountProbe = (skip: number) => Promise<boolean | null>;

/** First round's indexes: one parallel request each brackets any count up to 64k. */
const BOUNDS = [0, 64, 256, 1024, 4096, 16384, 65536];

/**
 * Size of a list that can only be asked "is there an item at index i?"
 * (ADO has no count endpoint for pull requests). A k-ary search: each
 * round probes k points inside the bracket in parallel, so thousands of
 * PRs take about 6 rounds of tiny `$top=1` requests instead of
 * downloading every PR. Null if any probe fails.
 */
export async function searchCount(probe: CountProbe, k = 8): Promise<number | null> {
  let lo = -1; // greatest index known to exist
  let hi = Infinity; // smallest index known to be missing
  const settle = async (points: number[]): Promise<boolean> => {
    const results = await Promise.all(points.map(probe));
    if (results.some((r) => r === null)) return false;
    points.forEach((p, i) => {
      if (results[i]) lo = Math.max(lo, p);
      else hi = Math.min(hi, p);
    });
    return true;
  };
  if (!(await settle(BOUNDS))) return null;
  for (let b = BOUNDS[BOUNDS.length - 1]! * 2; hi === Infinity; b *= 2) {
    if (!(await settle([b]))) return null;
  }
  while (hi - lo > 1) {
    const step = (hi - lo) / (k + 1);
    const points = new Set<number>();
    for (let i = 1; i <= k; i++) {
      const p = Math.floor(lo + step * i);
      if (p > lo && p < hi) points.add(p);
    }
    if (points.size === 0) points.add(lo + 1);
    if (!(await settle([...points]))) return null;
  }
  return hi;
}

export type PrStatus = "active" | "completed" | "abandoned";

/** How many PRs of a status the repo has (unfiltered, like the tab itself). */
export function countPrs(ref: RepoRef, status: PrStatus): Promise<number | null> {
  const base =
    `${projectBase(ref)}/_apis/git/repositories/${encodeURIComponent(ref.repo)}` +
    `/pullrequests?searchCriteria.status=${status}&$top=1&$skip=`;
  return searchCount(async (skip) => {
    const res = await apiFetch<{ value: unknown[] }>(base + skip);
    return res.ok ? res.value.value.length > 0 : null;
  });
}
