import { describe, expect, it } from "vitest";
import { parseViewedState } from "./reviewed-data";

describe("parseViewedState", () => {
  it("extracts paths from viewed entries", () => {
    const state = JSON.stringify({
      hashes: {
        "1@E790AC37@/.azure-pipelines/templates/stages/production.yml": 2,
        "1@C825E724@/backend/app/main.py": 2,
      },
    });
    expect(parseViewedState(state)).toEqual(
      new Set(["/.azure-pipelines/templates/stages/production.yml", "/backend/app/main.py"])
    );
  });

  it("keeps paths containing @ intact", () => {
    const state = JSON.stringify({ hashes: { "1@AB12CD34@/pkg/@scope/index.ts": 2 } });
    expect(parseViewedState(state)).toEqual(new Set(["/pkg/@scope/index.ts"]));
  });

  it("skips non-viewed statuses and malformed keys", () => {
    const state = JSON.stringify({
      hashes: {
        "1@AB12CD34@/not-viewed.py": 1,
        "no-at-signs": 2,
        "1@FFFFFFFF@relative/path.py": 2,
      },
    });
    expect(parseViewedState(state)).toEqual(new Set());
  });

  it("tolerates empty, absent and broken state", () => {
    expect(parseViewedState(undefined)).toEqual(new Set());
    expect(parseViewedState("")).toEqual(new Set());
    expect(parseViewedState("{not json")).toEqual(new Set());
    expect(parseViewedState('{"hashes":{}}')).toEqual(new Set());
  });
});
