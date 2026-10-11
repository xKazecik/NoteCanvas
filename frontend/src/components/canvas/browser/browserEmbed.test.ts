import { describe, expect, it } from "vitest";
import {
  BROWSER_ZOOM,
  getBrowserURL,
  getBrowserZoom,
  isBrowserElement,
  isEmbeddableLinkAllowed,
  newBrowserData,
  newEmbeddableElement,
} from "@excalidraw/element";

const embed = (customData?: Record<string, unknown>) =>
  newEmbeddableElement({
    type: "embeddable",
    x: 0,
    y: 0,
    width: 800,
    height: 520,
    customData,
  });

const browser = (zoom?: unknown) =>
  embed({ browser: zoom === undefined ? newBrowserData() : { zoom } });

describe("isBrowserElement", () => {
  it("tells a browser apart from a plain web embed", () => {
    expect(isBrowserElement(browser())).toBe(true);
    expect(isBrowserElement(embed())).toBe(false);
    expect(isBrowserElement(embed({ other: true }))).toBe(false);
    expect(isBrowserElement(null)).toBe(false);
  });
});

describe("getBrowserURL", () => {
  it("keeps http and https addresses", () => {
    expect(getBrowserURL("https://example.com/docs?a=1")).toBe(
      "https://example.com/docs?a=1",
    );
    expect(getBrowserURL("http://intranet.local/")).toBe(
      "http://intranet.local/",
    );
  });

  it("treats a bare host like an address bar does", () => {
    expect(getBrowserURL("  example.com/path ")).toBe(
      "https://example.com/path",
    );
  });

  it("refuses anything that is not a web page", () => {
    expect(getBrowserURL("javascript:alert(1)")).toBeNull();
    expect(getBrowserURL("data:text/html,<b>x</b>")).toBeNull();
    expect(getBrowserURL("file:///etc/passwd")).toBeNull();
    expect(getBrowserURL("")).toBeNull();
    expect(getBrowserURL(null)).toBeNull();
  });
});

describe("getBrowserZoom", () => {
  it("defaults to 100% for new, missing or malformed data", () => {
    expect(getBrowserZoom(browser())).toBe(BROWSER_ZOOM.default);
    expect(getBrowserZoom(browser("big"))).toBe(BROWSER_ZOOM.default);
    expect(getBrowserZoom(browser(0))).toBe(BROWSER_ZOOM.default);
  });

  it("clamps stored values into the supported range", () => {
    expect(getBrowserZoom(browser(0.5))).toBe(0.5);
    expect(getBrowserZoom(browser(0.01))).toBe(BROWSER_ZOOM.min);
    expect(getBrowserZoom(browser(40))).toBe(BROWSER_ZOOM.max);
  });
});

describe("isEmbeddableLinkAllowed", () => {
  it("lets a browser load any web page", () => {
    expect(
      isEmbeddableLinkAllowed(browser(), "https://example.com", undefined),
    ).toBe(true);
    expect(
      isEmbeddableLinkAllowed(browser(), "javascript:alert(1)", undefined),
    ).toBe(false);
  });

  it("keeps plain web embeds on the allow-list", () => {
    expect(
      isEmbeddableLinkAllowed(embed(), "https://example.com", undefined),
    ).toBe(false);
    expect(
      isEmbeddableLinkAllowed(
        embed(),
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        undefined,
      ),
    ).toBe(true);
  });
});
