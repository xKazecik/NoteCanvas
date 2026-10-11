import { getEmbedLink } from "./embeddable";

import type { ExcalidrawEmbeddableElement } from "./types";

/** How far the page inside a browser element can be zoomed out or in. */
export const BROWSER_ZOOM = {
  min: 0.25,
  max: 2,
  step: 0.25,
  default: 1,
} as const;

/** What a browser element keeps in `customData.browser`. */
export type BrowserData = { zoom: number };

export const BROWSER_DEFAULT_SIZE = { width: 800, height: 520 } as const;

export const newBrowserData = (): BrowserData => ({
  zoom: BROWSER_ZOOM.default,
});

export const clampBrowserZoom = (zoom: number): number =>
  Math.min(BROWSER_ZOOM.max, Math.max(BROWSER_ZOOM.min, zoom));

/** The page zoom, falling back to 100% for missing or malformed data. */
export const getBrowserZoom = (element: ExcalidrawEmbeddableElement): number => {
  const zoom = Number(element.customData?.browser?.zoom);
  return Number.isFinite(zoom) && zoom > 0
    ? clampBrowserZoom(zoom)
    : BROWSER_ZOOM.default;
};

/**
 * The address a browser element loads, or null when the link is not a web
 * page. A bare host such as `example.com` is treated as https, the way an
 * address bar would; any scheme other than http(s) is refused.
 */
export const getBrowserURL = (link: string | null | undefined) => {
  const trimmed = link?.trim();
  if (!trimmed) {
    return null;
  }
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : null;
  } catch {
    return null;
  }
};

const RE_INSTAGRAM_POST =
  /^https?:\/\/(?:www\.)?instagram\.com\/(?:[\w.]+\/)?(p|reels?|tv)\/([\w-]+)/i;
const RE_INSTAGRAM_PROFILE =
  /^https?:\/\/(?:www\.)?instagram\.com\/([\w.]+)\/?(?:[?#].*)?$/i;
/** First path segments that are Instagram pages rather than usernames. */
const INSTAGRAM_RESERVED = new Set([
  "accounts",
  "direct",
  "explore",
  "p",
  "reel",
  "reels",
  "stories",
  "tv",
]);

const RE_TWEET =
  /^https?:\/\/(?:www\.|mobile\.)?(?:twitter|x)\.com\/\w+\/status\/(\d+)/i;

const RE_YOUTUBE_HOST =
  /^https?:\/\/(?:[\w-]+\.)?(?:youtube\.com|youtu\.be)\//i;
/** YouTube addresses that point at something playable. */
const RE_YOUTUBE_PLAYABLE =
  /^https?:\/\/(?:youtu\.be\/[\w-]+|(?:www\.)?youtube\.com\/(?:watch\?|shorts\/|embed\/|playlist\?))/i;

/**
 * The address the frame actually loads for a browser's `url`.
 *
 * Big sites refuse to be shown inside other pages (X-Frame-Options), but most
 * publish an embed page for a single post or video that may be framed. Links
 * to those are swapped for their embed page here; everything else loads as
 * is. A home page or feed has no embed page and still refuses, so the frame
 * offers to open it in a tab instead.
 */
export const getBrowserFrameURL = (url: string): string => {
  const post = url.match(RE_INSTAGRAM_POST);
  if (post) {
    const kind = post[1].toLowerCase();
    return `https://www.instagram.com/${
      kind === "reels" ? "reel" : kind
    }/${post[2]}/embed/`;
  }
  const profile = url.match(RE_INSTAGRAM_PROFILE);
  if (profile && !INSTAGRAM_RESERVED.has(profile[1].toLowerCase())) {
    return `https://www.instagram.com/${profile[1]}/embed/`;
  }

  const tweet = url.match(RE_TWEET);
  if (tweet) {
    return `https://platform.twitter.com/embed/Tweet.html?id=${tweet[1]}`;
  }

  // the shared embed parser reads any youtube.com path as a video id, which
  // would turn a channel or search page into a broken player
  if (RE_YOUTUBE_HOST.test(url) && !RE_YOUTUBE_PLAYABLE.test(url)) {
    return url;
  }

  // YouTube videos, Vimeo, Google Docs, Figma and the other services the
  // embed parser knows; pages it would render from its own HTML are skipped
  const embed = getEmbedLink(url);
  return embed && embed.type !== "document" && !embed.error
    ? embed.link
    : url;
};
