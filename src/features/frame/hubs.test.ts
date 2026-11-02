import { describe, expect, it } from "vitest";
import { contributionId, fabricName, GROUP_ICONS, readHubLinks, SUBHUB_ICONS } from "./hubs";

/** Trimmed copies of ADO's live markup (PR list page, 2026-11-02). */
const INLINE_LIST = `
<div role="menu">
  <a id="__bolt-ms-vss-code-web-files-hub-link" class="hub navigation-element navigation-link" href="/org/proj/_git/repo">
    <span class="navigation-icon"><span class="fluent-icons-enabled"><span class="contributed-icon fabric-icon ms-Icon--FileCode"></span></span></span>
    <span class="navigation-text expanded-only">Files</span>
  </a>
  <a id="__bolt-ms-vss-code-web-new-prs-hub-link" class="hub displayed navigation-element navigation-link" href="/org/proj/_git/repo/pullrequests">
    <span class="navigation-icon"><span class="contributed-icon fabric-icon ms-Icon--BranchPullRequest"></span></span>
    <span class="navigation-text expanded-only">Pull requests</span>
  </a>
  <a id="__bolt-Some-Extension-hub-link" class="hub navigation-element navigation-link" href="/org/proj/_apps/hub/Some.Extension">
    <span class="navigation-icon"><img class="contributed-icon" src="x.svg"></span>
    <span class="navigation-text expanded-only">Extension</span>
  </a>
</div>`;

const FLYOUT = `
<div id="__bolt-menu-ms-vss-work-web-work-hub-group-callout" class="bolt-callout">
  <table role="menu"><tbody>
    <tr class="bolt-menuitem-row bolt-list-row bolt-menuitem-header" role="separator"><td>Boards</td></tr>
    <a id="__bolt-ms-vss-work-web-new-boards-hub" class="bolt-menuitem-row bolt-list-row" role="menuitem" href="/org/proj/_boards">
      <div class="bolt-menuitem-cell"><span class="contributed-icon fabric-icon ms-Icon--BacklogBoard"></span></div>
      <div class="bolt-menuitem-cell">Boards</div>
    </a>
    <a id="__bolt-ms-vss-work-web-new-sprints-hub" class="bolt-menuitem-row bolt-list-row" role="menuitem" href="/org/proj/_sprints">
      <div class="bolt-menuitem-cell">Sprints</div>
    </a>
    <a id="" class="bolt-menuitem-row" role="menuitem" href="/nowhere">Anonymous</a>
  </tbody></table>
</div>`;

function fixture(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
}

describe("contributionId", () => {
  it("strips bolt's id prefix and the inline list's -link suffix", () => {
    expect(contributionId("__bolt-ms-vss-code-web-files-hub-link")).toBe("ms-vss-code-web-files-hub");
    expect(contributionId("__bolt-ms-vss-work-web-new-boards-hub")).toBe("ms-vss-work-web-new-boards-hub");
    expect(contributionId("__bolt-ms-vss-work-web-work-hub-group-link")).toBe("ms-vss-work-web-work-hub-group");
  });
  it("rejects ids that are not bolt contribution ids", () => {
    expect(contributionId("project-expansion-toggle")).toBeNull();
    expect(contributionId("__bolt-")).toBeNull();
  });
});

describe("fabricName", () => {
  it("reads the ms-Icon--<Name> glyph", () => {
    const el = fixture('<span class="navigation-icon fabric-icon ms-Icon--DoubleChevronRight medium"></span>').firstElementChild!;
    expect(fabricName(el)).toBe("DoubleChevronRight");
    expect(fabricName(document.createElement("span"))).toBeNull();
  });
});

describe("readHubLinks", () => {
  it("reads the current group's inline list with labels, icons and the current page", () => {
    const links = readHubLinks(fixture(INLINE_LIST));
    expect(links.map((l) => [l.label, l.href, l.current, l.icon])).toEqual([
      ["Files", "/org/proj/_git/repo", false, "file-code"],
      ["Pull requests", "/org/proj/_git/repo/pullrequests", true, "git-pull-request"],
      ["Extension", "/org/proj/_apps/hub/Some.Extension", false, null],
    ]);
    expect(links[0]!.elementId).toBe("__bolt-ms-vss-code-web-files-hub-link");
  });

  it("keeps an unmapped hub's own icon for the menu to clone", () => {
    const ext = readHubLinks(fixture(INLINE_LIST))[2]!;
    expect(ext.nativeIcon?.tagName).toBe("IMG");
  });

  it("reads ADO's flyout rows, skipping the header row and id-less rows", () => {
    const links = readHubLinks(fixture(FLYOUT));
    expect(links.map((l) => [l.elementId, l.label, l.icon, l.current])).toEqual([
      ["__bolt-ms-vss-work-web-new-boards-hub", "Boards", "project", false],
      ["__bolt-ms-vss-work-web-new-sprints-hub", "Sprints", "iterations", false],
    ]);
    expect(links[1]!.nativeIcon).toBeNull();
  });
});

describe("icon tables", () => {
  it("cover every rail group and sub-page seen live", () => {
    expect(Object.keys(GROUP_ICONS)).toHaveLength(6);
    expect(SUBHUB_ICONS["ms-vss-code-web-new-prs-hub"]).toBe("git-pull-request");
  });
});
