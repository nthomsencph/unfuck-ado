import { describe, expect, it } from "vitest";
import { pickFilePath } from "./diff";

describe("pickFilePath", () => {
  it("skips breadcrumb dividers and picks the real path", () => {
    expect(pickFilePath(["/", "/", "/backend/app/x.py"])).toBe("/backend/app/x.py");
  });

  it("returns null when nothing looks like a path", () => {
    expect(pickFilePath(["36", "View", "/", null, undefined])).toBeNull();
  });
});
