import { describe, expect, it } from "vitest";
import { parseHubPath } from "./router";

describe("parseHubPath", () => {
  it("splits org, project, hub and decoded rest", () => {
    expect(parseHubPath("/o/My%20Project/_sprints/taskboard/My%20Team/Iter", "dev.azure.com")).toEqual({
      org: "o",
      project: "My Project",
      hub: "_sprints",
      rest: ["taskboard", "My Team", "Iter"],
    });
  });

  it("takes the org from the subdomain on legacy hosts and drops DefaultCollection", () => {
    expect(parseHubPath("/DefaultCollection/proj/_backlogs/backlog/Team/Epics", "myorg.visualstudio.com")).toEqual({
      org: "myorg",
      project: "proj",
      hub: "_backlogs",
      rest: ["backlog", "Team", "Epics"],
    });
  });

  it("returns null hub and empty rest without a hub segment", () => {
    expect(parseHubPath("/o/p", "dev.azure.com")).toEqual({
      org: "o",
      project: "p",
      hub: null,
      rest: [],
    });
  });
});
import { createRouter, parseRoute, type Route } from "./router";

describe("parseRoute", () => {
  it("parses a dev.azure.com board url", () => {
    const r = parseRoute("/myorg/MyProject/_boards/board/t/MyTeam/Stories", "dev.azure.com");
    expect(r).toMatchObject({ org: "myorg", project: "MyProject", area: "boards", id: null });
  });

  it("parses a work item edit url with id", () => {
    const r = parseRoute("/myorg/MyProject/_workitems/edit/1234", "dev.azure.com");
    expect(r).toMatchObject({ org: "myorg", project: "MyProject", area: "workitems", id: "1234" });
  });

  it("parses a pull request url with repo and id", () => {
    const r = parseRoute("/myorg/MyProject/_git/my-repo/pullrequest/99", "dev.azure.com");
    expect(r).toMatchObject({
      org: "myorg",
      project: "MyProject",
      repo: "my-repo",
      area: "repos-pr",
      id: "99",
    });
  });

  it("treats the PR list as repos-pr without an id", () => {
    const r = parseRoute("/myorg/MyProject/_git/my-repo/pullrequests", "dev.azure.com");
    expect(r).toMatchObject({ area: "repos-pr", repo: "my-repo", id: null });
  });

  it("treats plain repo browsing as unknown", () => {
    const r = parseRoute("/myorg/MyProject/_git/my-repo", "dev.azure.com");
    expect(r.area).toBe("unknown");
  });

  it("maps pipelines and wiki hubs", () => {
    expect(parseRoute("/o/p/_build", "dev.azure.com").area).toBe("pipelines");
    expect(parseRoute("/o/p/_pipelines", "dev.azure.com").area).toBe("pipelines");
    expect(parseRoute("/o/p/_wiki/wikis/p.wiki", "dev.azure.com").area).toBe("wiki");
    expect(parseRoute("/o/p/_sprints/taskboard/t/x", "dev.azure.com").area).toBe("boards");
    expect(parseRoute("/o/p/_backlogs/backlog/Team/Epics", "dev.azure.com").area).toBe("boards");
  });

  it("parses legacy visualstudio.com host with DefaultCollection", () => {
    const r = parseRoute(
      "/DefaultCollection/MyProject/_workitems/edit/5",
      "myorg.visualstudio.com"
    );
    expect(r).toMatchObject({ org: "myorg", project: "MyProject", area: "workitems", id: "5" });
  });

  it("parses visualstudio.com host without DefaultCollection", () => {
    const r = parseRoute("/MyProject/_boards/board/t/Team/Stories", "myorg.visualstudio.com");
    expect(r).toMatchObject({ org: "myorg", project: "MyProject", area: "boards" });
  });

  it("handles org-level pages with no project", () => {
    const r = parseRoute("/myorg/_settings/organizationOverview", "dev.azure.com");
    expect(r).toMatchObject({ org: "myorg", project: null, area: "unknown" });
  });

  it("decodes url-encoded project names", () => {
    const r = parseRoute("/myorg/My%20Project/_workitems/edit/7", "dev.azure.com");
    expect(r.project).toBe("My Project");
  });

  it("pulls the work item id from the board dialog query string", () => {
    const r = parseRoute(
      "/myorg/MyProject/_boards/board/t/Team/Stories",
      "dev.azure.com",
      "?workitem=4321"
    );
    expect(r).toMatchObject({ area: "boards", id: "4321" });
  });

  it("returns nulls for the bare root", () => {
    const r = parseRoute("/", "dev.azure.com");
    expect(r).toMatchObject({ org: null, project: null, area: "unknown", id: null });
  });
});

describe("createRouter", () => {
  // These tests mutate jsdom's shared history/location, so each resets the
  // URL first and they run against fresh instances.

  it("recheck() notifies only when the location actually moved", () => {
    history.replaceState({}, "", "/org/proj/_boards/board/t/Team/Stories");
    const router = createRouter(); // not started: history is unpatched
    const seen: Route[] = [];
    router.onChange((r) => seen.push(r));

    expect(router.recheck()).toBe(false);
    expect(seen).toHaveLength(0);

    history.replaceState({}, "", "/org/proj/_workitems/edit/42");
    expect(router.recheck()).toBe(true);
    expect(seen).toHaveLength(1);
    expect(router.current()).toMatchObject({ area: "workitems", id: "42" });
  });

  it("start() dispatches the initial route and again on pushState", () => {
    history.replaceState({}, "", "/org/proj/_wiki/wikis/x");
    const router = createRouter();
    const seen: Route[] = [];
    router.onChange((r) => seen.push(r));
    router.start();

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ area: "wiki" });

    history.pushState({}, "", "/org/proj/_git/repo/pullrequest/7");
    expect(seen).toHaveLength(2);
    expect(router.current()).toMatchObject({ area: "repos-pr", id: "7" });
  });
});
