export type Area = "boards" | "workitems" | "repos-pr" | "pipelines" | "wiki" | "unknown";

export interface Route {
  org: string | null;
  project: string | null;
  /** Repository name on _git routes (needed to address PR REST endpoints). */
  repo: string | null;
  area: Area;
  id: string | null; // work item id, PR id, etc.
  path: string;
}

const HUB_AREAS: Record<string, Area> = {
  _boards: "boards",
  _backlogs: "boards",
  _sprints: "boards",
  _workitems: "workitems",
  _build: "pipelines",
  _pipelines: "pipelines",
  _releases: "pipelines",
  _wiki: "wiki",
};

export function parseRoute(
  pathname: string,
  hostname: string = location.hostname,
  search: string = ""
): Route {
  const segments = pathname
    .split("/")
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });

  let org: string | null;
  if (hostname.endsWith(".visualstudio.com")) {
    // Legacy host: org is the subdomain, path may carry a DefaultCollection prefix.
    org = hostname.split(".")[0] ?? null;
    if (segments[0] === "DefaultCollection") segments.shift();
  } else {
    org = segments.shift() ?? null;
  }

  const hubIndex = segments.findIndex((s) => s.startsWith("_"));
  const hub = hubIndex >= 0 ? segments[hubIndex] : null;
  const project =
    hubIndex !== 0 && segments.length > 0 && !segments[0]!.startsWith("_") ? segments[0]! : null;

  let area: Area = "unknown";
  let id: string | null = null;
  let repo: string | null = null;

  if (hub) {
    if (hub === "_git") {
      // Only the PR views of the repos hub are interesting to us.
      const rest = segments.slice(hubIndex + 1);
      const prIndex = rest.findIndex((s) => s === "pullrequest" || s === "pullrequests");
      if (prIndex >= 0) {
        area = "repos-pr";
        // /_git/{repo}/pullrequest/{id} — the segment before the pr marker.
        repo = prIndex >= 1 ? (rest[prIndex - 1] ?? null) : null;
        const next = rest[prIndex + 1];
        if (next && /^\d+$/.test(next)) id = next;
      }
    } else {
      area = HUB_AREAS[hub] ?? "unknown";
    }
  }

  if (area === "workitems" && hubIndex >= 0) {
    const rest = segments.slice(hubIndex + 1);
    const editIndex = rest.findIndex((s) => s === "edit");
    const next = editIndex >= 0 ? rest[editIndex + 1] : undefined;
    if (next && /^\d+$/.test(next)) id = next;
  }

  // Boards open work items in a dialog and carry the id in the query string.
  if (!id && search) {
    const match = /[?&]workitem=(\d+)/.exec(search);
    if (match) id = match[1]!;
  }

  return { org, project, repo, area, id, path: pathname };
}

export interface Router {
  current(): Route;
  onChange(listener: (route: Route) => void): void;
  /** Patches history + popstate and dispatches the initial route. */
  start(): void;
  /**
   * Recompute from location; if it moved, update and notify. Returns whether
   * it moved. This is the observer's fallback for sandboxed userscript
   * contexts where the history patch never sees the page's own pushState.
   */
  recheck(): boolean;
}

export function createRouter(): Router {
  let current = parseRoute(location.pathname, location.hostname, location.search);
  let lastSeenKey = location.pathname + location.search;
  let listener: ((route: Route) => void) | null = null;

  // The single update path: one owner for lastSeenKey and for notification.
  const update = (force: boolean): boolean => {
    const key = location.pathname + location.search;
    if (!force && key === lastSeenKey) return false;
    lastSeenKey = key;
    current = parseRoute(location.pathname, location.hostname, location.search);
    listener?.(current);
    return true;
  };

  return {
    current: () => current,
    onChange(fn) {
      listener = fn;
    },
    start() {
      const wrap = (method: "pushState" | "replaceState"): void => {
        const original = history[method].bind(history);
        history[method] = ((...args: Parameters<History["pushState"]>) => {
          const result = original(...args);
          update(true);
          return result;
        }) as History["pushState"];
      };
      wrap("pushState");
      wrap("replaceState");
      window.addEventListener("popstate", () => update(true));
      update(true);
    },
    recheck: () => update(false),
  };
}
