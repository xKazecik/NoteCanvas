import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

/** What part of the scene is on screen: its centre and the zoom level. */
export type Camera = { centerX: number; centerY: number; zoom: number };

type Box = { x: number; y: number; width: number; height: number };
type Viewport = { width: number; height: number };

// Excalidraw's own zoom limits
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 30;

const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/** The smallest box holding every given box. */
export const unionBox = (boxes: readonly Box[]): Box => {
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
};

/** The camera that shows `box` as large as fits, centred. */
export const cameraForBox = (box: Box, viewport: Viewport): Camera => ({
  centerX: box.x + box.width / 2,
  centerY: box.y + box.height / 2,
  zoom: clampZoom(
    Math.min(viewport.width / box.width, viewport.height / box.height),
  ),
});

export const readCamera = (api: ExcalidrawImperativeAPI): Camera => {
  const { scrollX, scrollY, zoom, width, height } = api.getAppState();
  return {
    centerX: width / 2 / zoom.value - scrollX,
    centerY: height / 2 / zoom.value - scrollY,
    zoom: zoom.value,
  };
};

export const applyCamera = (
  api: ExcalidrawImperativeAPI,
  camera: Camera,
  extraAppState: Record<string, unknown> = {},
) => {
  const { width, height } = api.getAppState();
  api.updateScene({
    appState: {
      scrollX: width / 2 / camera.zoom - camera.centerX,
      scrollY: height / 2 / camera.zoom - camera.centerY,
      zoom: { value: camera.zoom },
      ...extraAppState,
    } as Parameters<ExcalidrawImperativeAPI["updateScene"]>[0]["appState"],
  });
};

/** Slow start, slow finish: a camera move reads as deliberate, not thrown. */
export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/**
 * The camera part-way from `from` to `to`.
 *
 * The centre moves in a straight line and the zoom changes geometrically, so
 * the move looks even at every zoom level. With `overview`, the zoom also
 * dips towards that level around the middle of the move and recovers by the
 * end -- pulling back far enough to see both ends before flying in.
 */
export const interpolateCamera = (
  from: Camera,
  to: Camera,
  progress: number,
  overview?: number,
): Camera => {
  const t = easeInOutCubic(Math.min(1, Math.max(0, progress)));
  let zoom = from.zoom * Math.pow(to.zoom / from.zoom, t);
  if (overview !== undefined) {
    // how far below the direct path the overview sits at the halfway point
    const direct = Math.sqrt(from.zoom * to.zoom);
    const dip = Math.min(1, overview / direct);
    zoom *= Math.pow(dip, Math.sin(Math.PI * t));
  }
  return {
    centerX: from.centerX + (to.centerX - from.centerX) * t,
    centerY: from.centerY + (to.centerY - from.centerY) * t,
    zoom: clampZoom(zoom),
  };
};

let cancelCurrent: (() => void) | null = null;

/** Stop the camera move in progress, if any, where it is. */
export const cancelCameraAnimation = () => cancelCurrent?.();

/**
 * Move the camera to `to` over `duration` ms. A new move, or
 * `cancelCameraAnimation`, stops the one in progress.
 */
export const animateCamera = (
  api: ExcalidrawImperativeAPI,
  to: Camera,
  duration: number,
  overview?: number,
) => {
  cancelCameraAnimation();
  if (duration <= 0) {
    applyCamera(api, to);
    return;
  }

  const from = readCamera(api);
  const start = performance.now();
  let frame = 0;
  let stopped = false;

  const step = (now: number) => {
    if (stopped) {
      return;
    }
    const progress = Math.min(1, (now - start) / duration);
    const done = progress >= 1;
    applyCamera(
      api,
      done ? to : interpolateCamera(from, to, progress, overview),
      // while zooming, elements are drawn from their cached bitmaps rather
      // than re-rasterised at every step, which is what keeps this smooth
      { shouldCacheIgnoreZoom: !done },
    );
    if (done) {
      cancelCurrent = null;
    } else {
      frame = requestAnimationFrame(step);
    }
  };

  cancelCurrent = () => {
    stopped = true;
    cancelAnimationFrame(frame);
    cancelCurrent = null;
    api.updateScene({ appState: { shouldCacheIgnoreZoom: false } });
  };
  frame = requestAnimationFrame(step);
};
