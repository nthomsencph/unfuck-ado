import { parseHubPath } from "../../core/router";

/**
 * Boards-hub path/scope helpers shared by backlog-status, sprint-header and
 * taskboard-columns — extracted so features stop importing them from each
 * other. All org/project/hub math goes through the router's parseHubPath.
 */

/** "/{org}/{project}/_backlogs/backlog/{team}/{level}" → storage scope key. */
export function backlogScopeKey(path: string): string | null {
  const { org, project, hub, rest } = parseHubPath(path);
  if (hub !== "_backlogs" || rest[0] !== "backlog") return null;
  const team = rest[1];
  const level = rest[2];
  if (!org || !project || !team || !level) return null;
  return `${org}/${project}/${team}/${level}`;
}

/** "taskboard" / "backlog" / "capacity" — the segment after _sprints. */
export function sprintTab(path: string): string | null {
  const { hub, rest } = parseHubPath(path);
  if (hub !== "_sprints") return null;
  return rest[0]?.toLowerCase() ?? null;
}

/**
 * Storage scope for the unfiltered total: the decoded path — it carries
 * org/project/tab/team/iteration, so each tab of each sprint remembers its
 * own total (taskboard counts tasks, backlog counts tree rows).
 */
export function sprintScopeKey(path: string): string | null {
  const { org, project, hub, rest } = parseHubPath(path);
  if (hub !== "_sprints") return null;
  return [org, project, hub, ...rest].filter(Boolean).join("/");
}

/** "/{org}/{project}/_sprints/{tab}/{team}/…" → "org/project/team". */
export function taskboardTeamKey(path: string): string | null {
  const { org, project, hub, rest } = parseHubPath(path);
  if (hub !== "_sprints") return null;
  const team = rest[1];
  if (!org || !project || !team) return null;
  return `${org}/${project}/${team}`;
}
