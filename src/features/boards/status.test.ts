import { beforeEach, describe, expect, it } from "vitest";
import { formatBacklogStatus, parseBacklogFilters, resolveTotal } from "./status";
import { storageKey } from "../../core/storage";

describe("parseBacklogFilters", () => {
  it("parses System.* params into labeled entries, in URL order", () => {
    const f = parseBacklogFilters(
      "?System.State=Active%2CNew%2CReady%20for%20deploy&System.AreaPath=AI%20Platform"
    );
    expect(f.entries).toEqual([
      { label: "State", values: ["Active", "New", "Ready for deploy"] },
      { label: "Area", values: ["AI Platform"] },
    ]);
    expect(f.keyword).toBeNull();
  });

  it("captures the keyword filter from the text param", () => {
    const f = parseBacklogFilters("?text=probe123");
    expect(f.entries).toEqual([]);
    expect(f.keyword).toBe("probe123");
  });

  it("shortens backslash path values to their leaf segment", () => {
    const f = parseBacklogFilters("?System.IterationPath=Proj%5CRelease%201%5CSprint%2012");
    expect(f.entries).toEqual([{ label: "Iteration", values: ["Sprint 12"] }]);
  });

  it("maps the known field names and falls back to the bare name", () => {
    const f = parseBacklogFilters(
      "?System.WorkItemType=Bug&System.AssignedTo=someone&System.Tags=x&System.Whatever=y"
    );
    expect(f.entries.map((e) => e.label)).toEqual(["Type", "Assigned to", "Tags", "Whatever"]);
  });

  it("ignores unrelated params and handles an empty search", () => {
    expect(parseBacklogFilters("").entries).toEqual([]);
    expect(parseBacklogFilters("?foo=bar").entries).toEqual([]);
  });
});

describe("formatBacklogStatus", () => {
  it("folds the area into the sentence and trails the other filters", () => {
    const f = parseBacklogFilters(
      "?System.State=Active%2CNew%2CReady%20for%20deploy%2CReady%20For%20Review&System.AreaPath=AI%20Platform"
    );
    expect(formatBacklogStatus(176, 255, f)).toBe(
      'Showing 176 of 255 items in area "AI Platform" · State: Active, New +2'
    );
  });

  it("pluralizes areas and truncates past two", () => {
    const f = parseBacklogFilters("?System.AreaPath=A%2CB%2CC");
    expect(formatBacklogStatus(10, null, f)).toBe('Showing 10 items in areas "A", "B" +1');
  });

  it("renders 'n of m' when filtered and a total is known", () => {
    const f = parseBacklogFilters("?System.State=Active");
    expect(formatBacklogStatus(176, 255, f)).toBe("Showing 176 of 255 items · State: Active");
  });

  it("suppresses a stale total smaller than the shown count", () => {
    const f = parseBacklogFilters("?System.State=Active");
    expect(formatBacklogStatus(176, 100, f)).toBe("Showing 176 items · State: Active");
  });

  it("never renders 'of m' when nothing is filtered", () => {
    expect(formatBacklogStatus(255, 255, parseBacklogFilters(""))).toBe("Showing 255 items");
  });

  it("renders the bare count when nothing is filtered", () => {
    expect(formatBacklogStatus(42, null, parseBacklogFilters(""))).toBe("Showing 42 items");
  });

  it("renders an area-only filter without a trailing dot segment", () => {
    const f = parseBacklogFilters("?System.AreaPath=AI%20Platform");
    expect(formatBacklogStatus(176, 255, f)).toBe(
      'Showing 176 of 255 items in area "AI Platform"'
    );
  });

  it("appends the keyword in quotes", () => {
    const f = parseBacklogFilters("?System.AreaPath=AI%20Platform&text=login");
    expect(formatBacklogStatus(3, null, f)).toBe(
      'Showing 3 items in area "AI Platform" · "login"'
    );
  });

  it("shows a keyword-only filter", () => {
    expect(formatBacklogStatus(3, null, parseBacklogFilters("?text=login"))).toBe(
      'Showing 3 items · "login"'
    );
  });

  it("uses the singular for one item", () => {
    expect(formatBacklogStatus(1, null, parseBacklogFilters(""))).toBe("Showing 1 item");
  });
});

describe("resolveTotal", () => {
  const FEATURE = "resolve-total-test";
  const SCOPE = "o/p/team/Stories";

  beforeEach(() => {
    localStorage.removeItem(storageKey(FEATURE, SCOPE));
  });

  it("stores the unfiltered count as the scope's total and returns null", () => {
    expect(resolveTotal(FEATURE, SCOPE, 255, false)).toBeNull();
    expect(resolveTotal(FEATURE, SCOPE, 176, true)).toBe(255);
  });

  it("guards against the transient zero while a board is still mounting", () => {
    resolveTotal(FEATURE, SCOPE, 255, false);
    resolveTotal(FEATURE, SCOPE, 0, false);
    expect(resolveTotal(FEATURE, SCOPE, 10, true)).toBe(255);
  });

  it("returns null when filtered with no stored total, and without a scope", () => {
    expect(resolveTotal(FEATURE, SCOPE, 5, true)).toBeNull();
    expect(resolveTotal(FEATURE, null, 5, false)).toBeNull();
  });
});
