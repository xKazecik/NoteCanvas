import { describe, expect, it } from "vitest";
import {
  BROWSER_ZOOM,
  getBrowserURL,
  getBrowserZoom,
  getBrowserFrameURL,
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


describe("getBrowserZoom on older web embeds", () => {
  it("treats an embed saved before browsers existed as 100%", () => {
    expect(getBrowserZoom(embed())).toBe(BROWSER_ZOOM.default);
  });
});

describe("getBrowserFrameURL", () => {
  it("loads Instagram posts, reels and profiles through their embed page", () => {
    expect(getBrowserFrameURL("https://www.instagram.com/p/C0nZxVnLc2H/")).toBe(
      "https://www.instagram.com/p/C0nZxVnLc2H/embed/",
    );
    expect(
      getBrowserFrameURL("https://www.instagram.com/reels/C0nZxVnLc2H/?igsh=x"),
    ).toBe("https://www.instagram.com/reel/C0nZxVnLc2H/embed/");
    expect(
      getBrowserFrameURL("https://www.instagram.com/natgeo/p/C0nZxVnLc2H/"),
    ).toBe("https://www.instagram.com/p/C0nZxVnLc2H/embed/");
    expect(getBrowserFrameURL("https://www.instagram.com/natgeo/")).toBe(
      "https://www.instagram.com/natgeo/embed/",
    );
  });

  it("leaves Instagram pages without an embed page alone", () => {
    for (const url of [
      "https://www.instagram.com/",
      "https://www.instagram.com/explore/",
      "https://www.instagram.com/p/",
    ]) {
      expect(getBrowserFrameURL(url)).toBe(url);
    }
  });

  it("plays YouTube videos and playlists through the embed player", () => {
    expect(
      getBrowserFrameURL("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    ).toMatch(/^https:\/\/www\.youtube\.com\/embed\/dQw4w9WgXcQ\b/);
    expect(getBrowserFrameURL("https://youtu.be/dQw4w9WgXcQ?t=42")).toMatch(
      /^https:\/\/www\.youtube\.com\/embed\/dQw4w9WgXcQ\?.*start=42/,
    );
    expect(
      getBrowserFrameURL("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
    ).toMatch(/^https:\/\/www\.youtube\.com\/embed\/dQw4w9WgXcQ\b/);
    expect(
      getBrowserFrameURL("https://www.youtube.com/playlist?list=PLabc123"),
    ).toMatch(/^https:\/\/www\.youtube\.com\/embed\/videoseries\?list=PLabc123/);
  });

  it("does not turn YouTube pages that are not videos into a player", () => {
    for (const url of [
      "https://www.youtube.com/",
      "https://www.youtube.com/results?search_query=cats",
      "https://www.youtube.com/@channel",
    ]) {
      expect(getBrowserFrameURL(url)).toBe(url);
    }
  });

  it("shows tweets through Twitter's embed page", () => {
    expect(getBrowserFrameURL("https://x.com/jack/status/20")).toBe(
      "https://platform.twitter.com/embed/Tweet.html?id=20",
    );
  });

  it("loads any other page as it is", () => {
    expect(getBrowserFrameURL("https://example.com/docs")).toBe(
      "https://example.com/docs",
    );
  });
});
