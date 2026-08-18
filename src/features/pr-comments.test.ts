import { describe, expect, it } from "vitest";
import { parseResolvedText } from "./pr-comments";

describe("parseResolvedText", () => {
  it("parses the header's n/m text", () => {
    expect(parseResolvedText("0/2 comments resolved")).toEqual({ resolved: 0, total: 2 });
    expect(parseResolvedText("  14/23 comments resolved ")).toEqual({ resolved: 14, total: 23 });
  });

  it("rejects anything else", () => {
    expect(parseResolvedText("comments resolved")).toBeNull();
    expect(parseResolvedText("3 comments")).toBeNull();
    expect(parseResolvedText("")).toBeNull();
    expect(parseResolvedText(null)).toBeNull();
    expect(parseResolvedText(undefined)).toBeNull();
  });
});
