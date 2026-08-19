/**
 * Pure label/value logic for the work item form rebuild — every English-UI
 * text match the feature relies on lives here (the ledger's label-match
 * caveat has one home), plus the small string transforms, all testable
 * without a DOM.
 */

/** What the rail does with a group, matched by its header text. */
export type GroupAction = "hide" | "relwork" | "absorb" | null;

/**
 * Development and Implementation (bugs name it "System Info") disappear
 * outright; Related Work only earns its place with actual links; Planning /
 * Classification / Effort are absorbed — their fields join the adofix
 * Details list row-by-row and the native group becomes a zero-size stub.
 */
export function groupAction(label: string): GroupAction {
  if (/^(Development|Implementation|System Info)/.test(label)) return "hide";
  if (/^Related Work/.test(label)) return "relwork";
  if (/^(Planning|Classification|Effort)/.test(label)) return "absorb";
  return null;
}

/** The Description section header (hidden; Repro Steps etc. keep theirs). */
export const DESCRIPTION_HEADER_RE = /^Description/;

/** "Proj\\Release 1\\Sprint 12" → "Sprint 12" (area/iteration leaf). */
export function leaf(path: string): string {
  return path.split("\\").pop() ?? path;
}

/** "Updated by X: 8h ago" → "X, 8h ago" (the KV row's Updated value). */
export function updatedText(raw: string): string {
  return raw.replace(/^Updated by /, "").replace(/:\s*/, ", ");
}

/** Absorbed-field row key: "Story Points" → "planning-story-points". */
export function planningKey(fieldLabel: string): string {
  return `planning-${fieldLabel.toLowerCase().replace(/\W+/g, "-")}`;
}

/** ISO date → "19 Aug 2026" in the user's locale; "?" when absent. */
export function formatCreatedDate(raw: string | undefined): string {
  return raw
    ? new Date(raw).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "?";
}
