import { rotateViewportPoint } from "@excalidraw/common";

import type { AppState, NormalizedZoomValue } from "../types";

export const getStateForZoom = (
  {
    viewportX,
    viewportY,
    nextZoom,
  }: {
    viewportX: number;
    viewportY: number;
    nextZoom: NormalizedZoomValue;
  },
  appState: AppState,
) => {
  // notecanvas: scroll and zoom live in the untilted space, so the point to
  // zoom about is taken there first; it then stays put on screen as well
  const { x: appLayerX, y: appLayerY } = rotateViewportPoint(
    viewportX - appState.offsetLeft,
    viewportY - appState.offsetTop,
    appState,
    -1,
  );

  const currentZoom = appState.zoom.value;

  // get original scroll position without zoom
  const baseScrollX = appState.scrollX + (appLayerX - appLayerX / currentZoom);
  const baseScrollY = appState.scrollY + (appLayerY - appLayerY / currentZoom);

  // get scroll offsets for target zoom level
  const zoomOffsetScrollX = -(appLayerX - appLayerX / nextZoom);
  const zoomOffsetScrollY = -(appLayerY - appLayerY / nextZoom);

  return {
    scrollX: baseScrollX + zoomOffsetScrollX,
    scrollY: baseScrollY + zoomOffsetScrollY,
    zoom: {
      value: nextZoom,
    },
  };
};
