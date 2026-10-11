import { embeddableURLValidator } from "./embeddable";
import { isBrowserElement } from "./typeChecks";

import type { ExcalidrawProps } from "@excalidraw/excalidraw/types";

import type { ExcalidrawElement, ExcalidrawEmbeddableElement } from "./types";

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

/**
 * Whether an embeddable may load `link`. Browser elements accept any web page;
 * every other embed stays on the host's allow-list.
 */
export const isEmbeddableLinkAllowed = (
  element: ExcalidrawElement,
  link: string | null | undefined,
  validateEmbeddable: ExcalidrawProps["validateEmbeddable"],
): boolean =>
  isBrowserElement(element)
    ? !!getBrowserURL(link)
    : embeddableURLValidator(link, validateEmbeddable);
