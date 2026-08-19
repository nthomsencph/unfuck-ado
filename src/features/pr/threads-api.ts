import { apiFetch, projectBase, type ApiResult, type ProjectRef } from "../../core/api";
import type { Route } from "../../core/router";

/** Everything needed to address one PR through the REST API. */
export interface PrRef extends ProjectRef {
  repo: string;
  prId: string;
}

/** Null unless the route addresses one concrete PR. */
export function prRefFromRoute(route: Route): PrRef | null {
  return route.org && route.project && route.repo && route.id
    ? { org: route.org, project: route.project, repo: route.repo, prId: route.id }
    : null;
}

/** Cache/dedupe key: one string per PR. */
export function refKey(ref: PrRef): string {
  return `${ref.org}/${ref.project}/${ref.repo}/${ref.prId}`;
}

export type DiffSide = "left" | "right";

export interface NewThreadInput {
  /** Markdown — ADO renders PR comment content as markdown server-side. */
  content: string;
  /** Repo path with leading slash, as shown in the diff section header. */
  filePath: string;
  line: number;
  /** Inclusive range end; omit for a single-line comment. */
  endLine?: number;
  side: DiffSide;
  /** Whole-file comment: anchors to the file itself, no line positions. */
  fileLevel?: boolean;
}

interface ThreadPosition {
  line: number;
  offset: number;
}

export interface ThreadPayload {
  comments: Array<{ parentCommentId: number; content: string; commentType: number }>;
  status: number;
  threadContext: {
    filePath: string;
    rightFileStart?: ThreadPosition;
    rightFileEnd?: ThreadPosition;
    leftFileStart?: ThreadPosition;
    leftFileEnd?: ThreadPosition;
  };
}

/**
 * Pure — unit tested. status 1 = active, commentType 1 = text. Anchors on the
 * latest iteration; offset 1 anchors at line starts, which is all Phase 2
 * needs (word-level anchoring would set real offsets). A range spans from the
 * start line to the end line, both at column 1.
 */
export function buildThreadPayload(input: NewThreadInput): ThreadPayload {
  if (input.fileLevel) {
    return {
      comments: [{ parentCommentId: 0, content: input.content, commentType: 1 }],
      status: 1,
      threadContext: { filePath: input.filePath },
    };
  }
  const start: ThreadPosition = { line: input.line, offset: 1 };
  const end: ThreadPosition = { line: Math.max(input.endLine ?? input.line, input.line), offset: 1 };
  const anchor =
    input.side === "right"
      ? { rightFileStart: start, rightFileEnd: end }
      : { leftFileStart: start, leftFileEnd: end };
  return {
    comments: [{ parentCommentId: 0, content: input.content, commentType: 1 }],
    status: 1,
    threadContext: { filePath: input.filePath, ...anchor },
  };
}

/**
 * POST a new comment thread on the PR. Write auth is the session cookie —
 * same verified path as work item PATCHes (see writeHeaders in core/api.ts).
 */
export function createThread(
  ref: PrRef,
  input: NewThreadInput
): Promise<ApiResult<{ id: number }>> {
  return apiFetch(
    `${projectBase(ref)}/_apis/git/repositories/${encodeURIComponent(ref.repo)}/pullRequests/${encodeURIComponent(ref.prId)}/threads`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildThreadPayload(input)),
    }
  );
}
