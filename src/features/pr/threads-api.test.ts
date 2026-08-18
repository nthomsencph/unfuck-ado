import { afterEach, describe, expect, it, vi } from "vitest";
import { buildThreadPayload, createThread } from "./threads-api";

afterEach(() => vi.unstubAllGlobals());

describe("buildThreadPayload", () => {
  it("anchors right-side comments on rightFileStart/End", () => {
    const p = buildThreadPayload({ content: "hm", filePath: "/src/a.ts", line: 42, side: "right" });
    expect(p).toEqual({
      comments: [{ parentCommentId: 0, content: "hm", commentType: 1 }],
      status: 1,
      threadContext: {
        filePath: "/src/a.ts",
        rightFileStart: { line: 42, offset: 1 },
        rightFileEnd: { line: 42, offset: 1 },
      },
    });
  });

  it("anchors left-side (removed line) comments on leftFileStart/End", () => {
    const p = buildThreadPayload({ content: "x", filePath: "/src/a.ts", line: 7, side: "left" });
    expect(p.threadContext.leftFileStart).toEqual({ line: 7, offset: 1 });
    expect(p.threadContext.rightFileStart).toBeUndefined();
  });

  it("spans a range from the start line to endLine", () => {
    const p = buildThreadPayload({
      content: "x",
      filePath: "/a.ts",
      line: 214,
      endLine: 221,
      side: "right",
    });
    expect(p.threadContext.rightFileStart).toEqual({ line: 214, offset: 1 });
    expect(p.threadContext.rightFileEnd).toEqual({ line: 221, offset: 1 });
  });

  it("clamps an endLine before the start line back to a single line", () => {
    const p = buildThreadPayload({
      content: "x",
      filePath: "/a.ts",
      line: 10,
      endLine: 3,
      side: "right",
    });
    expect(p.threadContext.rightFileEnd).toEqual({ line: 10, offset: 1 });
  });

  it("anchors file-level comments on the file alone, without positions", () => {
    const p = buildThreadPayload({
      content: "x",
      filePath: "/a.ts",
      line: 0,
      side: "right",
      fileLevel: true,
    });
    expect(p.threadContext).toEqual({ filePath: "/a.ts" });
  });
});

describe("createThread", () => {
  it("POSTs the payload to the PR threads endpoint", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ id: 1 }),
      text: async () => JSON.stringify({ id: 1 }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await createThread(
      { org: "myorg", project: "My Project", repo: "my-repo", prId: "99" },
      { content: "hi", filePath: "/a.py", line: 3, side: "right" }
    );

    expect(res.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe(
      "/myorg/My%20Project/_apis/git/repositories/my-repo/pullRequests/99/threads?api-version=7.1"
    );
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body)).threadContext.filePath).toBe("/a.py");
  });
});
