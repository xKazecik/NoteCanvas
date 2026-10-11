import { useState } from "react";

import { BROWSER_ZOOM, clampBrowserZoom } from "@excalidraw/element";

import { t } from "../i18n";

import {
  BrowserHomeIcon,
  ExternalLinkIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "./icons";

import "./BrowserFrame.scss";

/**
 * The live page inside a browser element: a slim address bar over an iframe.
 * The bar always takes clicks; the page takes them while the element is active,
 * or all the time in view mode (App decides), so a site stays usable on a
 * slide during a presentation.
 */
export const BrowserFrame = ({
  url,
  zoom,
  canEdit,
  onZoomChange,
}: {
  url: string;
  zoom: number;
  /** Zoom is stored on the element, so only editors get to change it. */
  canEdit: boolean;
  onZoomChange: (zoom: number) => void;
}) => {
  // Remounting the iframe drops wherever the viewer has navigated to and loads
  // the element's own link again. This is per viewer and never saved.
  const [session, setSession] = useState(0);

  // A page from our own origin must not get allow-same-origin next to
  // allow-scripts, or it could reach out of the sandbox into the editor.
  const sameOrigin = new URL(url).origin === window.location.origin;
  const address = url.replace(/^https?:\/\//, "");

  return (
    <div className="excalidraw__browser">
      <div className="excalidraw__browser__bar">
        <button
          type="button"
          title={t("buttons.browserReset")}
          aria-label={t("buttons.browserReset")}
          onClick={() => setSession((value) => value + 1)}
        >
          {BrowserHomeIcon}
        </button>
        <span className="excalidraw__browser__address" title={url}>
          {address}
        </span>
        {canEdit && (
          <>
            <button
              type="button"
              title={t("buttons.browserZoomOut")}
              aria-label={t("buttons.browserZoomOut")}
              disabled={zoom <= BROWSER_ZOOM.min}
              onClick={() =>
                onZoomChange(clampBrowserZoom(zoom - BROWSER_ZOOM.step))
              }
            >
              {ZoomOutIcon}
            </button>
            <span className="excalidraw__browser__zoom">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              title={t("buttons.browserZoomIn")}
              aria-label={t("buttons.browserZoomIn")}
              disabled={zoom >= BROWSER_ZOOM.max}
              onClick={() =>
                onZoomChange(clampBrowserZoom(zoom + BROWSER_ZOOM.step))
              }
            >
              {ZoomInIcon}
            </button>
          </>
        )}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title={t("buttons.browserOpen")}
          aria-label={t("buttons.browserOpen")}
        >
          {ExternalLinkIcon}
        </a>
      </div>
      <div className="excalidraw__browser__page">
        <iframe
          key={session}
          src={url}
          title={address}
          // the page is laid out at 1/zoom of the box and scaled back to fit,
          // so zooming out shows more of a site rather than shrinking the box
          style={{
            width: `${100 / zoom}%`,
            height: `${100 / zoom}%`,
            transform: `scale(${zoom})`,
          }}
          referrerPolicy="strict-origin-when-cross-origin"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen={true}
          sandbox={`${
            sameOrigin ? "" : "allow-same-origin "
          }allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-downloads`}
        />
      </div>
    </div>
  );
};
