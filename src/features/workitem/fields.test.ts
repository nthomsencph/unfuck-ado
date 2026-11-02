import { describe, expect, it } from "vitest";
import {
  DESCRIPTION_HEADER_RE,
  formatCreatedDate,
  groupAction,
  leaf,
  planningKey,
  updatedText,
} from "./fields";

describe("groupAction", () => {
  it("hides Implementation/System Info", () => {
    expect(groupAction("Implementation")).toBe("hide");
    expect(groupAction("System Info")).toBe("hide");
  });

  it("marks the link sections (Related Work, Development) for their header '+'", () => {
    expect(groupAction("Related Work")).toBe("links");
    expect(groupAction("Development")).toBe("links");
  });

  it("absorbs Planning/Classification/Effort into the Details list", () => {
    expect(groupAction("Planning")).toBe("absorb");
    expect(groupAction("Classification")).toBe("absorb");
    expect(groupAction("Effort")).toBe("absorb");
  });

  it("matches by prefix (headers may carry counts/suffixes)", () => {
    expect(groupAction("Implementation (2)")).toBe("hide");
    expect(groupAction("Related Work (3)")).toBe("links");
  });

  it("leaves unknown groups alone", () => {
    expect(groupAction("Deployment")).toBeNull();
    expect(groupAction("")).toBeNull();
  });
});

describe("leaf", () => {
  it("takes the last backslash segment", () => {
    expect(leaf("Proj\\Release 1\\Sprint 12")).toBe("Sprint 12");
  });
  it("passes plain values through", () => {
    expect(leaf("AI Platform")).toBe("AI Platform");
    expect(leaf("")).toBe("");
  });
});

describe("updatedText", () => {
  it('turns "Updated by X: 8h ago" into "X, 8h ago"', () => {
    expect(updatedText("Updated by Jane Doe: 8h ago")).toBe("Jane Doe, 8h ago");
  });
  it("only rewrites the first colon separator", () => {
    expect(updatedText("Updated by A: B: C")).toBe("A, B: C");
  });
});

describe("planningKey", () => {
  it("kebab-cases the field label under a planning- prefix", () => {
    expect(planningKey("Story Points")).toBe("planning-story-points");
    expect(planningKey("Priority")).toBe("planning-priority");
  });
});

describe("formatCreatedDate", () => {
  it("formats an ISO date as day/short-month/year", () => {
    expect(formatCreatedDate("2026-08-19T10:00:00Z")).toMatch(/19|Aug|2026/);
  });
  it("renders ? when the field is absent", () => {
    expect(formatCreatedDate(undefined)).toBe("?");
  });
});

describe("DESCRIPTION_HEADER_RE", () => {
  it("matches the description header, English or this org's Danish label", () => {
    expect(DESCRIPTION_HEADER_RE.test("Description")).toBe(true);
    expect(DESCRIPTION_HEADER_RE.test("Beskrivelse")).toBe(true);
    expect(DESCRIPTION_HEADER_RE.test("Repro Steps")).toBe(false);
  });
});
