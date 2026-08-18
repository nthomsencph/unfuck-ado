import type { Route } from "../../core/router";
import { getValue, setValue } from "../../core/storage";
import type { DiffSide } from "./threads-api";

export interface Draft {
  id: string;
  filePath: string;
  line: number;
  /** Inclusive range end; absent for single-line drafts (additive, older stored drafts stay valid). */
  endLine?: number;
  side: DiffSide;
  /** Whole-file comment: line is 0 and the thread anchors to the file itself. */
  fileLevel?: boolean;
  /** Markdown — passed to ADO verbatim, rendered server-side. */
  content: string;
}

const FEATURE = "pr-drafts";

/**
 * One draft list per PR, keyed org/project/repo/prId (none of those segments
 * can contain "/"). Null when the route isn't a concrete PR.
 */
export function draftKey(route: Route): string | null {
  if (route.area !== "repos-pr" || !route.org || !route.project || !route.repo || !route.id) {
    return null;
  }
  return `${route.org}/${route.project}/${route.repo}/${route.id}`;
}

export function loadDrafts(key: string): Draft[] {
  return getValue<Draft[]>(FEATURE, key, []);
}

export function saveDrafts(key: string, drafts: Draft[]): void {
  setValue(FEATURE, key, drafts);
}

export function newDraftId(): string {
  return `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
