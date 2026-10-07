import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

type MockFetchResponse = {
  ok: boolean;
  status: number;
  headers: { get: (name: string) => string | null };
  json: () => Promise<unknown>;
};

const makeFetchResponse = (opts: {
  status: number;
  json?: unknown;
  etag?: string | null;
}): MockFetchResponse => ({
  ok: opts.status >= 200 && opts.status < 300,
  status: opts.status,
  headers: {
    get: (name: string) => {
      if (name.toLowerCase() === "etag") return opts.etag ?? null;
      return null;
    },
  },
  json: async () => opts.json,
});

describe("system/update logic", () => {
  const originalOutbound = process.env.UPDATE_CHECK_OUTBOUND;

  beforeEach(() => {
    vi.resetModules();
    process.env.UPDATE_CHECK_OUTBOUND = "true";
  });

  afterEach(() => {
    process.env.UPDATE_CHECK_OUTBOUND = originalOutbound;
    vi.restoreAllMocks();
  });

  it("returns outbound disabled payload when UPDATE_CHECK_OUTBOUND=false", async () => {
    process.env.UPDATE_CHECK_OUTBOUND = "false";
    const fetchSpy = vi.fn();
    (globalThis as any).fetch = fetchSpy;

    const mod = await import("./update");
    mod.__resetUpdateCacheForTests();
    const latest = await mod.fetchLatest("stable");

    expect(latest.outboundEnabled).toBe(false);
    expect(latest.latestVersion).toBe(null);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("stable channel picks the highest MAJOR.MINOR image tag (ignores latest, sha-*, prereleases)", async () => {
    const packages = [
      { name: "notecanvas", version: "latest", html_url: "u0", created_at: "t0" },
      { name: "notecanvas", version: "sha-cfbf385", html_url: "u1", created_at: "t1" },
      { name: "notecanvas", version: "2.10-rc.1", html_url: "u2", created_at: "t2" },
      { name: "notecanvas", version: "2.9", html_url: "u3", created_at: "t3" },
      { name: "notecanvas", version: "2.10", html_url: "u4", created_at: "t4" },
      { name: "notecanvas-other", version: "9.9", html_url: "u5", created_at: "t5" },
    ];
    (globalThis as any).fetch = vi.fn().mockResolvedValue(
      makeFetchResponse({ status: 200, json: packages, etag: "E1" })
    );

    const mod = await import("./update");
    mod.__resetUpdateCacheForTests();
    const latest = await mod.fetchLatest("stable");

    expect(latest.channel).toBe("stable");
    expect(latest.latestVersion).toBe("2.10");
    expect(latest.latestUrl).toBe("u4");
    expect(latest.publishedAt).toBe("t4");
    expect(mod.computeIsUpdateAvailable("2.9", latest.latestVersion)).toBe(true);
    expect(mod.computeIsUpdateAvailable("2.10", latest.latestVersion)).toBe(false);
  });

  it("prerelease channel can pick prerelease when newer than stable", async () => {
    const packages = [
      { name: "notecanvas", version: "1.2-dev.2", html_url: "u1", created_at: "t1" },
      { name: "notecanvas", version: "1.1", html_url: "u2", created_at: "t2" },
      { name: "notecanvas", version: "1.2-dev.10", html_url: "u3", created_at: "t3" },
    ];
    (globalThis as any).fetch = vi.fn().mockResolvedValue(
      makeFetchResponse({ status: 200, json: packages, etag: "E2" })
    );

    const mod = await import("./update");
    mod.__resetUpdateCacheForTests();
    const latest = await mod.fetchLatest("prerelease");

    expect(latest.channel).toBe("prerelease");
    expect(latest.latestVersion).toBe("1.2-dev.10");
    expect(mod.computeIsUpdateAvailable("1.2-dev.1", latest.latestVersion)).toBe(true);
  });

  it("uses cached response when the registry returns 304", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        makeFetchResponse({
          status: 200,
          json: [{ name: "notecanvas", version: "2.0", html_url: "u", created_at: "t" }],
          etag: "ETAG-1",
        })
      )
      .mockResolvedValueOnce(makeFetchResponse({ status: 304, json: null, etag: null }));
    (globalThis as any).fetch = fetchMock;

    const mod = await import("./update");
    mod.__resetUpdateCacheForTests();
    const r1 = await mod.fetchLatest("stable");

    mod.__setUpdateTtlForTests(0);
    const r2 = await mod.fetchLatest("stable");

    expect(r1.latestVersion).toBe("2.0");
    expect(r2.latestVersion).toBe("2.0");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const secondCall = fetchMock.mock.calls[1] as any[];
    const secondOpts = secondCall?.[1] as { headers?: Record<string, string> } | undefined;
    expect(secondOpts?.headers?.["If-None-Match"]).toBe("ETAG-1");
  });
});
