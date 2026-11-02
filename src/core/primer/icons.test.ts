import { describe, expect, it } from "vitest";
import { octicon, type OcticonName } from "./icons";

describe("octicon", () => {
  it("renders a decorative 16px svg colored by currentColor", () => {
    const svg = octicon("git-pull-request");
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(svg.getAttribute("class")).toBe("octicon octicon-git-pull-request");
    expect(svg.getAttribute("width")).toBe("16");
    expect(svg.getAttribute("height")).toBe("16");
    expect(svg.getAttribute("viewBox")).toBe("0 0 16 16");
    expect(svg.getAttribute("fill")).toBe("currentColor");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.querySelector("path")?.getAttribute("d")).toMatch(/^M/);
  });

  it("uses the 24px drawing from 24px up", () => {
    const svg = octicon("check", 24);
    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg.getAttribute("width")).toBe("24");
  });

  it("scales the 16px drawing for other sizes", () => {
    const svg = octicon("check", 12);
    expect(svg.getAttribute("viewBox")).toBe("0 0 16 16");
    expect(svg.getAttribute("height")).toBe("12");
  });

  it("throws on an icon that is not bundled", () => {
    expect(() => octicon("no-such-icon" as OcticonName)).toThrow(/not bundled/);
  });
});
