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
