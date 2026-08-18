import { describe, expect, it } from "vitest";
import {
  checkLabel,
  selectInlineChecks,
  statusText,
  type RawPolicyEvaluation,
} from "./checks-api";

function evaluation(
  type: string,
  status: string,
  opts: {
    blocking?: boolean;
    enabled?: boolean;
    deleted?: boolean;
    settingsName?: string;
  } = {}
): RawPolicyEvaluation {
  return {
    status,
    configuration: {
      isBlocking: opts.blocking ?? false,
      isEnabled: opts.enabled ?? true,
      isDeleted: opts.deleted ?? false,
      type: { displayName: type },
      settings: { displayName: opts.settingsName ?? null },
    },
  };
}

describe("selectInlineChecks", () => {
  it("drops policy types the card already shows natively", () => {
    const rows = selectInlineChecks([
      evaluation("Build", "approved", { settingsName: "pipeline-build-policy" }),
      evaluation("Minimum number of reviewers", "rejected", { blocking: true }),
      evaluation("Require a merge strategy", "rejected", { blocking: true }),
      evaluation("Required reviewers", "rejected", { blocking: true }),
      evaluation("Work item linking", "rejected"),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.label).toBe("Work items must be linked");
  });

  it("drops disabled, deleted and notApplicable evaluations", () => {
    const rows = selectInlineChecks([
      evaluation("Comment requirements", "rejected", { enabled: false }),
      evaluation("Comment requirements", "rejected", { deleted: true }),
      evaluation("Comment requirements", "notApplicable"),
      { status: "rejected" }, // no configuration at all
    ]);
    expect(rows).toHaveLength(0);
  });

  it("keeps unknown policy types — surfacing them is the point", () => {
    const rows = selectInlineChecks([
      evaluation("Some org-specific gate", "queued", { blocking: true }),
    ]);
    expect(rows).toEqual([
      { label: "Some org-specific gate", status: "queued", required: true },
    ]);
  });

  it("sorts failures first, then required, then label", () => {
    const rows = selectInlineChecks([
      evaluation("Zeta gate", "approved"),
      evaluation("Comment requirements", "rejected"),
      evaluation("Alpha gate", "approved", { blocking: true }),
      evaluation("Work item linking", "rejected", { blocking: true }),
    ]);
    expect(rows.map((r) => r.label)).toEqual([
      "Work items must be linked", // rejected + required
      "Comments must be resolved", // rejected
      "Alpha gate", // approved + required
      "Zeta gate", // approved
    ]);
  });
});

describe("checkLabel", () => {
  it("prefers the configured display name", () => {
    expect(
      checkLabel(evaluation("Status", "approved", { settingsName: "SonarQube gate" }))
    ).toBe("SonarQube gate");
  });

  it("falls back to the friendly label, then the raw type", () => {
    expect(checkLabel(evaluation("Comment requirements", "rejected"))).toBe(
      "Comments must be resolved"
    );
    expect(checkLabel(evaluation("Exotic policy", "rejected"))).toBe("Exotic policy");
    expect(checkLabel({ status: "rejected" })).toBe("Check");
  });
});

describe("statusText", () => {
  it("maps the known evaluation statuses", () => {
    expect(statusText("approved")).toBe("Succeeded");
    expect(statusText("rejected")).toBe("Failed");
    expect(statusText("queued")).toBe("Queued");
    expect(statusText("running")).toBe("Running");
    expect(statusText("broken")).toBe("Broken");
    expect(statusText("weird")).toBe("weird");
  });
});
