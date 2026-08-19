import { apiFetch, orgBase, projectBase, type ApiResult } from "../../core/api";
import type { PrRef } from "./threads-api";

/**
 * Policy evaluations behind the status card's "View n checks" panel. ADO
 * renders Build policies as native card rows but hides everything else
 * (work-item linking, comment requirements, external status checks) behind
 * the panel — a failed optional check is invisible until you open it.
 */

export interface RawPolicyEvaluation {
  status?: string;
  configuration?: {
    isBlocking?: boolean;
    isEnabled?: boolean;
    isDeleted?: boolean;
    type?: { displayName?: string };
    settings?: { displayName?: string | null };
  };
}

export interface CheckRow {
  label: string;
  /** Raw evaluation status: approved | rejected | queued | running | broken. */
  status: string;
  required: boolean;
}

/**
 * Policy types the status card already surfaces as dedicated rows (reviewer
 * row, merge row, native build-check rows) — re-listing them would duplicate.
 * Everything NOT here renders inline; unknown types are the point of the
 * feature, so this is an exclude-list, not an include-list.
 */
const NATIVELY_SHOWN_TYPES = new Set([
  "Build",
  "Minimum number of reviewers",
  "Required reviewers",
  "Require a merge strategy",
]);

/** ADO's own panel wording for the common hidden policies. */
const FRIENDLY_LABELS: Record<string, string> = {
  "Work item linking": "Work items must be linked",
  "Comment requirements": "Comments must be resolved",
};

export function checkLabel(evaluation: RawPolicyEvaluation): string {
  const settings = evaluation.configuration?.settings?.displayName;
  if (settings) return settings;
  const type = evaluation.configuration?.type?.displayName ?? "Check";
  return FRIENDLY_LABELS[type] ?? type;
}

export function statusText(status: string): string {
  switch (status) {
    case "approved":
      return "Succeeded";
    case "rejected":
      return "Failed";
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    case "broken":
      return "Broken";
    default:
      return status;
  }
}

/**
 * The evaluations worth adding to the card: enabled, not deleted, not already
 * shown natively, and actually evaluated (notApplicable policies would only
 * add noise). Failures sort first (they are what the summary line teases),
 * required before optional within the same status, then by label.
 */
export function selectInlineChecks(evaluations: RawPolicyEvaluation[]): CheckRow[] {
  const rows = evaluations
    .filter((e) => {
      const cfg = e.configuration;
      if (!cfg || cfg.isEnabled === false || cfg.isDeleted === true) return false;
      if (NATIVELY_SHOWN_TYPES.has(cfg.type?.displayName ?? "")) return false;
      return e.status !== undefined && e.status !== "notApplicable";
    })
    .map((e) => ({
      label: checkLabel(e),
      status: e.status as string,
      required: e.configuration?.isBlocking === true,
    }));
  const rank = (r: CheckRow): number => (r.status === "rejected" ? 0 : 1);
  return rows.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      Number(b.required) - Number(a.required) ||
      a.label.localeCompare(b.label)
  );
}

// Project GUIDs are stable; one lookup per (org, project) per page load.
const projectIdCache = new Map<string, string>();

async function getProjectId(org: string, project: string): Promise<ApiResult<string>> {
  const key = `${org}/${project}`;
  const cached = projectIdCache.get(key);
  if (cached) return { ok: true, value: cached };
  const res = await apiFetch<{ id: string }>(
    `${orgBase(org)}/_apis/projects/${encodeURIComponent(project)}`
  );
  if (!res.ok) return res;
  projectIdCache.set(key, res.value.id);
  return { ok: true, value: res.value.id };
}

export async function fetchPolicyEvaluations(
  ref: PrRef
): Promise<ApiResult<RawPolicyEvaluation[]>> {
  const project = await getProjectId(ref.org, ref.project);
  if (!project.ok) return project;
  const artifactId = encodeURIComponent(
    `vstfs:///CodeReview/CodeReviewId/${project.value}/${ref.prId}`
  );
  const res = await apiFetch<{ value?: RawPolicyEvaluation[] }>(
    `${projectBase(ref)}/_apis/policy/evaluations` +
      `?artifactId=${artifactId}&api-version=7.1-preview.1`
  );
  if (!res.ok) return res;
  return { ok: true, value: res.value.value ?? [] };
}
