import { afterEach, describe, expect, it, vi } from "vitest";
import {
  apiFetch,
  buildStatePatch,
  getWorkItem,
  getWorkItems,
  orgBase,
  projectBase,
  setWorkItemState,
} from "./api";

interface MockResponseInit {
  status?: number;
  body?: unknown;
}

function mockResponse({ status = 200, body = {} }: MockResponseInit = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `status-${status}`,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function stubFetch(response: ReturnType<typeof mockResponse>) {
  const fn = vi.fn(async () => response);
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("orgBase", () => {
  it("prefixes the org on dev.azure.com", () => {
    expect(orgBase("myorg", "dev.azure.com")).toBe("/myorg");
  });
  it("is empty on legacy visualstudio.com hosts", () => {
    expect(orgBase("myorg", "myorg.visualstudio.com")).toBe("");
  });
});

describe("apiFetch", () => {
  it("appends api-version and sends same-origin credentials", async () => {
    const fetchMock = stubFetch(mockResponse({ body: { id: 1 } }));
    const result = await apiFetch("/o/p/_apis/wit/workitems/1");

    expect(result).toEqual({ ok: true, value: { id: 1 } });
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe("/o/p/_apis/wit/workitems/1?api-version=7.1");
    expect(init.credentials).toBe("same-origin");
  });

  it("appends api-version with & when a query string exists", async () => {
    const fetchMock = stubFetch(mockResponse());
    await apiFetch("/o/p/_apis/x?y=1");
    const [url] = fetchMock.mock.calls[0]! as unknown as [string];
    expect(url).toBe("/o/p/_apis/x?y=1&api-version=7.1");
  });

  it("returns errors as values with the server message", async () => {
    stubFetch(mockResponse({ status: 403, body: { message: "nope" } }));
    const result = await apiFetch("/o/p/_apis/x");
    expect(result).toEqual({ ok: false, error: { status: 403, message: "nope" } });
  });

  it("returns status 0 on network failure instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    const result = await apiFetch("/o/p/_apis/x");
    expect(result).toEqual({ ok: false, error: { status: 0, message: "offline" } });
  });
});

describe("projectBase", () => {
  it("encodes the project and joins it to the org base", () => {
    expect(projectBase({ org: "myorg", project: "My Project" })).toBe("/myorg/My%20Project");
  });
});

describe("getWorkItem", () => {
  it("appends a fields query when fields are given", async () => {
    const fetchMock = stubFetch(mockResponse({ body: { id: 7, fields: {} } }));
    await getWorkItem({ org: "o", project: "p" }, 7, ["System.CreatedBy", "System.CreatedDate"]);
    const [url] = fetchMock.mock.calls[0]! as unknown as [string];
    expect(url).toBe(
      "/o/p/_apis/wit/workitems/7?fields=System.CreatedBy,System.CreatedDate&api-version=7.1"
    );
  });

  it("omits the query without fields", async () => {
    const fetchMock = stubFetch(mockResponse({ body: { id: 7, fields: {} } }));
    await getWorkItem({ org: "o", project: "p" }, "7");
    const [url] = fetchMock.mock.calls[0]! as unknown as [string];
    expect(url).toBe("/o/p/_apis/wit/workitems/7?api-version=7.1");
  });
});

describe("getWorkItems", () => {
  it("builds the batch url from ids and fields", async () => {
    const fetchMock = stubFetch(mockResponse({ body: { count: 0, value: [] } }));
    await getWorkItems({ org: "o", project: "p" }, [1, 2, 3], ["System.CommentCount"]);
    const [url] = fetchMock.mock.calls[0]! as unknown as [string];
    expect(url).toBe(
      "/o/p/_apis/wit/workitems?ids=1,2,3&fields=System.CommentCount&api-version=7.1"
    );
  });
});

describe("buildStatePatch", () => {
  it("builds the json-patch document", () => {
    expect(buildStatePatch("Done")).toEqual([
      { op: "add", path: "/fields/System.State", value: "Done" },
    ]);
  });
});

describe("setWorkItemState", () => {
  it("PATCHes the work item with a json-patch body", async () => {
    const fetchMock = stubFetch(mockResponse({ body: { id: 123, fields: {} } }));
    const result = await setWorkItemState({ org: "myorg", project: "My Project" }, "123", "Active");

    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe("/myorg/My%20Project/_apis/wit/workitems/123?api-version=7.1");
    expect(init.method).toBe("PATCH");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json-patch+json"
    );
    expect(JSON.parse(String(init.body))).toEqual([
      { op: "add", path: "/fields/System.State", value: "Active" },
    ]);
  });
});
