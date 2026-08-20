import { afterEach, describe, expect, it } from "vitest";
import {
  rewriteMetaValues,
  shouldRedirectToActive,
  sweepMetaLines,
  sweepOwnership,
} from "./pr-list";

describe("sweepOwnership", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function listWithRows(ids: number[]): HTMLElement[] {
    const table = document.createElement("table");
    table.className = "repos-pr-list";
    const rows = ids.map((id) => {
      const row = document.createElement("a");
      row.className = "bolt-table-row";
      row.href = `/org/proj/_git/repo/pullrequest/${id}`;
      table.appendChild(row);
      return row;
    });
    document.body.appendChild(table);
    return rows;
  }

  it("tags rows by ownership and clears stale tags", () => {
    const [a, b, c] = listWithRows([7039, 6970, 6904]);
    c!.setAttribute("data-adofix-mine", "author"); // stale from a prior sweep
    sweepOwnership(
      document,
      new Map([
        [7039, "author"],
        [6970, "reviewer"],
      ])
    );
    expect(a!.getAttribute("data-adofix-mine")).toBe("author");
    expect(b!.getAttribute("data-adofix-mine")).toBe("reviewer");
    expect(c!.hasAttribute("data-adofix-mine")).toBe(false);
  });
});

describe("shouldRedirectToActive", () => {
  it("redirects the explicit Mine view", () => {
    expect(shouldRedirectToActive("?_a=mine")).toBe(true);
  });

  it("redirects the bare list URL (ADO defaults it to Mine)", () => {
    expect(shouldRedirectToActive("")).toBe(true);
    expect(shouldRedirectToActive("?createdBy=abc")).toBe(true);
  });

  it("respects any other explicit view", () => {
    expect(shouldRedirectToActive("?_a=active")).toBe(false);
    expect(shouldRedirectToActive("?_a=completed")).toBe(false);
    expect(shouldRedirectToActive("?_a=abandoned")).toBe(false);
  });
});

/** The live meta-line span: text nodes then the branch icon + name spans. */
function buildRow(metaTextNodes: string[]): HTMLElement {
  const table = document.createElement("table");
  table.className = "repos-pr-list";
  const row = document.createElement("a");
  row.href = "/org/proj/_git/repo/pullrequest/7039";
  const line = document.createElement("div");
  line.className = "secondary-text body-s text-ellipsis";
  const span = document.createElement("span");
  for (const t of metaTextNodes) span.appendChild(document.createTextNode(t));
  const icon = document.createElement("span");
  icon.className = "fluent-icons-enabled";
  const branch = document.createElement("span");
  branch.className = "monospaced-xs padding-horizontal-4";
  branch.textContent = "main";
  span.append(icon, branch);
  line.appendChild(span);
  row.appendChild(line);
  table.appendChild(row);
  document.body.appendChild(table);
  return span;
}

describe("rewriteMetaValues", () => {
  it("rewrites the live node shape to '!id · First · into '", () => {
    expect(
      rewriteMetaValues(["", "Nicolai Syv.ai konsulent", " request !", "7039", " into "])
    ).toEqual(["", "!7039", " · ", "Nicolai", " · into "]);
  });

  it("takes the first whitespace token of single-token names too", () => {
    expect(rewriteMetaValues(["", "nthomsencph", " request !", "12", " into "])).toEqual([
      "",
      "!12",
      " · ",
      "nthomsencph",
      " · into ",
    ]);
  });

  it("is idempotent: a rewritten shape no longer matches", () => {
    expect(rewriteMetaValues(["", "!7039", " · ", "Nicolai", " · into "])).toBeNull();
  });

  it("leaves unknown shapes alone (localized UI, ADO update)", () => {
    expect(rewriteMetaValues(["", "Nicolai", " anmodning !", "7039", " ind i "])).toBeNull();
    expect(rewriteMetaValues(["", "Nicolai", " request !", "abc", " into "])).toBeNull();
    expect(rewriteMetaValues([""])).toBeNull();
  });
});

describe("sweepMetaLines", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("rewrites a live-shaped row in place, preserving the branch spans", () => {
    const span = buildRow(["", "Nicolai Syv.ai konsulent", " request !", "7039", " into "]);
    sweepMetaLines(document);
    expect(span.textContent).toBe("!7039 · Nicolai · into main");
    expect(span.querySelector(".monospaced-xs")?.textContent).toBe("main");
  });

  it("is a no-op on the second pass", () => {
    const span = buildRow(["", "Nicolai Syv.ai konsulent", " request !", "7039", " into "]);
    sweepMetaLines(document);
    sweepMetaLines(document);
    expect(span.textContent).toBe("!7039 · Nicolai · into main");
  });

  it("leaves non-matching rows untouched", () => {
    const span = buildRow(["", "Nicolai", " anmodning !", "7039", " ind i "]);
    sweepMetaLines(document);
    expect(span.textContent).toBe("Nicolai anmodning !7039 ind i main");
  });
});
