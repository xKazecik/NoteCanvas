import { afterEach, describe, expect, it } from "vitest";
import { AxiosError } from "axios";
import { getConnectionTimeoutMs, isNetworkError } from "./offlineState";

const setEnv = (value: unknown) => {
  (window as { __ENV__?: Record<string, unknown> }).__ENV__ = {
    OFFLINE_CONNECTION_TIMEOUT_MS: value,
  };
};

describe("getConnectionTimeoutMs", () => {
  afterEach(() => {
    delete (window as { __ENV__?: unknown }).__ENV__;
  });

  it("defaults to 10 seconds when unset or empty", () => {
    expect(getConnectionTimeoutMs()).toBe(10_000);
    setEnv("");
    expect(getConnectionTimeoutMs()).toBe(10_000);
  });

  it("uses the configured value, including 0 for no limit", () => {
    setEnv("2500");
    expect(getConnectionTimeoutMs()).toBe(2500);
    setEnv("0");
    expect(getConnectionTimeoutMs()).toBe(0);
  });

  it("ignores values that aren't a non-negative number", () => {
    setEnv("soon");
    expect(getConnectionTimeoutMs()).toBe(10_000);
    setEnv("-5");
    expect(getConnectionTimeoutMs()).toBe(10_000);
  });
});

describe("isNetworkError", () => {
  it("treats a timed-out request as the server being unreachable", () => {
    const timeout = new AxiosError("timeout of 10000ms exceeded", "ECONNABORTED");
    expect(isNetworkError(timeout)).toBe(true);
  });
});
