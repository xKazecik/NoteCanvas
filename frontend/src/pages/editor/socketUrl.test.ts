import { describe, expect, it } from "vitest";
import { resolveSocketUrl } from "./socketUrl";

const PAGE = "https://notki.example.com";

describe("resolveSocketUrl", () => {
  it("uses the page origin when VITE_API_URL is unset", () => {
    // The production regression: nothing sets VITE_API_URL in the Docker build,
    // so this used to fall through to http://localhost:8000 and collaboration
    // silently never connected while the REST API kept working.
    expect(resolveSocketUrl(undefined, PAGE)).toBe(PAGE);
  });

  it("uses the page origin for the default relative base", () => {
    expect(resolveSocketUrl("/api", PAGE)).toBe(PAGE);
  });

  it("uses the page origin for any other relative base", () => {
    expect(resolveSocketUrl("/backend/api", PAGE)).toBe(PAGE);
  });

  it("treats blank and whitespace values as unset", () => {
    expect(resolveSocketUrl("", PAGE)).toBe(PAGE);
    expect(resolveSocketUrl("   ", PAGE)).toBe(PAGE);
  });

  it("keeps only the origin of an absolute base", () => {
    // socket.io reads a trailing path as a namespace, so the /api must go.
    expect(resolveSocketUrl("https://api.example.com/api", PAGE)).toBe(
      "https://api.example.com",
    );
  });

  it("keeps a non-default port on an absolute base", () => {
    expect(resolveSocketUrl("http://localhost:8000/api", PAGE)).toBe(
      "http://localhost:8000",
    );
  });

  it("falls back to the page origin when the base will not parse", () => {
    expect(resolveSocketUrl("http://[bad", PAGE)).toBe(PAGE);
  });
});
