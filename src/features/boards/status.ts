import { getValue, setValue } from "../../core/storage";

/**
 * The filter-parsing / status-formatting / total-memory library shared by
 * the Backlogs (backlog-status) and Sprints (sprint-header) header texts —
 * extracted so a feature file no longer doubles as a library.
 */

/** System.<field> → display label; anything unknown shows its bare name. */
const FIELD_LABELS: Record<string, string> = {
  State: "State",
  AreaPath: "Area",
  IterationPath: "Iteration",
  WorkItemType: "Type",
  AssignedTo: "Assigned to",
  Tags: "Tags",
};

export interface BacklogFilters {
  entries: Array<{ label: string; values: string[] }>;
  keyword: string | null;
}

export function parseBacklogFilters(search: string): BacklogFilters {
  const params = new URLSearchParams(search);
  const entries: BacklogFilters["entries"] = [];
  let keyword: string | null = null;
  for (const [key, value] of params) {
    if (key === "text") {
      keyword = value || null;
      continue;
    }
    if (!key.startsWith("System.")) continue;
    const field = key.slice("System.".length);
    const values = value
      .split(",")
      .map((v) => v.split("\\").pop() ?? v)
      .filter((v) => v.length > 0);
    entries.push({ label: FIELD_LABELS[field] ?? field, values });
  }
  return { entries, keyword };
}

/** "A", "B" for the first two values, then a " +n" tail. */
function valueList(values: string[], quote: boolean): string {
  const shown = values.slice(0, 2).map((v) => (quote ? `"${v}"` : v));
  const rest = values.length > 2 ? ` +${values.length - 2}` : "";
  return shown.join(", ") + rest;
}

export function formatBacklogStatus(
  shown: number,
  total: number | null,
  filters: BacklogFilters
): string {
  const filtered = filters.entries.length > 0 || filters.keyword !== null;
  const ofTotal = filtered && total !== null && total >= shown ? ` of ${total}` : "";
  let text = `Showing ${shown}${ofTotal} ${shown === 1 && ofTotal === "" ? "item" : "items"}`;
  // Area reads as part of the sentence (the user's main orientation signal);
  // every other filter trails as "Label: values" segments.
  const area = filters.entries.find((e) => e.label === "Area");
  if (area) {
    text += ` in ${area.values.length === 1 ? "area" : "areas"} ${valueList(area.values, true)}`;
  }
  const parts = filters.entries
    .filter((e) => e !== area)
    .map(({ label, values }) => `${label}: ${valueList(values, false)}`);
  if (filters.keyword) parts.push(`"${filters.keyword}"`);
  return parts.length > 0 ? `${text} · ${parts.join(" · ")}` : text;
}

/**
 * The unfiltered-total memory behind "n of m": an unfiltered view IS the
 * total for its scope — store it (guarded against the transient zero while a
 * board or tree is still mounting) and return null (no "of m" needed); a
 * filtered view reads the stored total back. Totals persist per feature and
 * scope (GM storage, survives reloads).
 */
export function resolveTotal(
  featureId: string,
  scope: string | null,
  shown: number,
  filtered: boolean
): number | null {
  if (!scope) return null;
  if (!filtered) {
    if (shown > 0 && getValue<number | null>(featureId, scope, null) !== shown) {
      setValue(featureId, scope, shown);
    }
    return null;
  }
  return getValue<number | null>(featureId, scope, null);
}
