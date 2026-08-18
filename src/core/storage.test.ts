import { beforeEach, describe, expect, it } from "vitest";
import { getValue, SCHEMA_VERSION, setValue, storageKey } from "./storage";

describe("storage", () => {
  beforeEach(() => localStorage.clear());

  it("namespaces keys as adofix.<feature>.<key>", () => {
    expect(storageKey("pr-thread-filter", "hideResolved")).toBe(
      "adofix.pr-thread-filter.hideResolved"
    );
  });

  it("round-trips values through the schema envelope", () => {
    setValue("feat", "flag", true);
    expect(getValue("feat", "flag", false)).toBe(true);

    const raw = localStorage.getItem("adofix.feat.flag");
    expect(JSON.parse(raw!)).toEqual({ v: SCHEMA_VERSION, data: true });
  });

  it("returns the fallback for missing keys", () => {
    expect(getValue("feat", "missing", "default")).toBe("default");
  });

  it("returns the fallback on schema version mismatch", () => {
    localStorage.setItem("adofix.feat.old", JSON.stringify({ v: 999, data: "stale" }));
    expect(getValue("feat", "old", "fresh")).toBe("fresh");
  });

  it("returns the fallback on corrupted json", () => {
    localStorage.setItem("adofix.feat.bad", "not json {");
    expect(getValue("feat", "bad", 42)).toBe(42);
  });
});
