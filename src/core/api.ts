export const API_VERSION = "7.1";

export interface ApiError {
  /** HTTP status; 0 means the request never got a response. */
  status: number;
  message: string;
}

export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ApiError };

/**
 * Same-origin base path for REST calls. On dev.azure.com the org is the first
 * path segment; on {org}.visualstudio.com it is the subdomain, so the base is
 * empty.
 */
export function orgBase(org: string, hostname: string = location.hostname): string {
  return hostname.endsWith(".visualstudio.com") ? "" : `/${encodeURIComponent(org)}`;
}

/**
 * Verified live 2026-08-01: no CSRF/verification header is required. A
 * same-origin PATCH to `_apis/wit/workitems/{nonexistent-id}` with only the
 * session cookie returned 404 TF401232 ("work item does not exist") — i.e. it
 * passed the auth layer; 401/403 would have meant a missing header. Kept as a
 * hook because it is the ONLY place write headers would be set if ADO ever
 * starts requiring one.
 */
function writeHeaders(): Record<string, string> {
  return {};
}

/**
 * Same-origin fetch wrapper. Never throws; errors come back as values because
 * Phase 2 (batched draft comments) needs partial-failure handling.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const url = path.includes("api-version=")
    ? path
    : `${path}${path.includes("?") ? "&" : "?"}api-version=${API_VERSION}`;
  const method = (init.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(method === "GET" ? {} : writeHeaders()),
    ...((init.headers as Record<string, string> | undefined) ?? {}),
  };

  try {
    const res = await fetch(url, { ...init, headers, credentials: "same-origin" });
    if (!res.ok) {
      let message = res.statusText;
      try {
        const body = (await res.json()) as { message?: string };
        if (body.message) message = body.message;
      } catch {
        // non-JSON error body — keep statusText
      }
      return { ok: false, error: { status: res.status, message } };
    }
    const text = await res.text();
    const value = (text ? JSON.parse(text) : undefined) as T;
    return { ok: true, value };
  } catch (err) {
    return {
      ok: false,
      error: { status: 0, message: err instanceof Error ? err.message : String(err) },
    };
  }
}

// ---- Work item tracking -----------------------------------------------------

/**
 * (org, project) always travel together; as two positional strings a swapped
 * pair typechecks and fails as a runtime 404. Callers hold a Route with these
 * exact fields — build the ref from it after null-checking.
 */
export interface ProjectRef {
  org: string;
  project: string;
}

export interface WorkItem {
  id: number;
  fields: Record<string, unknown>;
}

export interface WorkItemTypeState {
  name: string;
  color?: string;
  stateCategory?: string;
}

export interface JsonPatchOp {
  op: "add" | "replace" | "remove" | "test";
  path: string;
  value?: unknown;
}

export function buildStatePatch(state: string): JsonPatchOp[] {
  return [{ op: "add", path: "/fields/System.State", value: state }];
}

/** Same-origin base for project-scoped REST paths. */
export function projectBase(ref: ProjectRef): string {
  return `${orgBase(ref.org)}/${encodeURIComponent(ref.project)}`;
}

export function getWorkItem(
  ref: ProjectRef,
  id: string | number,
  fields?: readonly string[]
): Promise<ApiResult<WorkItem>> {
  const query = fields?.length ? `?fields=${fields.map(encodeURIComponent).join(",")}` : "";
  return apiFetch<WorkItem>(
    `${projectBase(ref)}/_apis/wit/workitems/${encodeURIComponent(String(id))}${query}`
  );
}

/** Batch read. ADO caps ids at 200 per call — callers chunk. */
export function getWorkItems(
  ref: ProjectRef,
  ids: readonly number[],
  fields: readonly string[]
): Promise<ApiResult<{ count: number; value: WorkItem[] }>> {
  return apiFetch(
    `${projectBase(ref)}/_apis/wit/workitems?ids=${ids.join(",")}` +
      `&fields=${fields.map(encodeURIComponent).join(",")}`
  );
}

export function getWorkItemTypeStates(
  ref: ProjectRef,
  type: string
): Promise<ApiResult<{ count: number; value: WorkItemTypeState[] }>> {
  return apiFetch(`${projectBase(ref)}/_apis/wit/workitemtypes/${encodeURIComponent(type)}/states`);
}

export function setWorkItemState(
  ref: ProjectRef,
  id: string,
  state: string
): Promise<ApiResult<WorkItem>> {
  return apiFetch<WorkItem>(`${projectBase(ref)}/_apis/wit/workitems/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json-patch+json" },
    body: JSON.stringify(buildStatePatch(state)),
  });
}
