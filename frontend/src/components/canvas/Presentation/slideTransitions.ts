import {
  CaptureUpdateAction,
  newElementWith,
  newFrameElement,
  syncInvalidIndices,
} from "@excalidraw/element";

import type { t } from "@excalidraw/excalidraw";
import type { ExcalidrawFrameLikeElement } from "@excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

export type SlideTransition = "smooth" | "cut" | "fade" | "zoom";

export const SLIDE_TRANSITIONS: {
  id: SlideTransition;
  label: Parameters<typeof t>[0];
}[] = [
  { id: "smooth", label: "presentation.transitionSmooth" },
  { id: "cut", label: "presentation.transitionCut" },
  { id: "fade", label: "presentation.transitionFade" },
  { id: "zoom", label: "presentation.transitionZoom" },
];

/**
 * How the presentation arrives on a slide, kept on the slide's frame so it
 * saves and syncs with the drawing. Slides without one glide, as before.
 */
export const getSlideTransition = (
  frame: ExcalidrawFrameLikeElement,
): SlideTransition => {
  const value = frame.customData?.slideTransition;
  return SLIDE_TRANSITIONS.some((transition) => transition.id === value)
    ? value
    : "smooth";
};

export const setSlideTransition = (
  api: ExcalidrawImperativeAPI,
  frameId: string,
  transition: SlideTransition,
) => {
  api.updateScene({
    elements: api
      .getSceneElements()
      .map((element) =>
        element.id === frameId
          ? newElementWith(element, {
              customData: { ...element.customData, slideTransition: transition },
            })
          : element,
      ),
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
};

/** Moves the camera onto one or more frames; supplied by the presentation. */
type ShowFrames = (
  target: ExcalidrawFrameLikeElement | ExcalidrawFrameLikeElement[],
  animate: boolean,
  duration?: number,
) => void;

const FADE_MS = 220;
const ZOOM_STEP_MS = 450;

/** Cover the screen in `background`, swap slides unseen, then uncover. */
const fadeThrough = (background: string, swap: () => void) => {
  const veil = document.createElement("div");
  Object.assign(veil.style, {
    position: "fixed",
    inset: "0",
    background,
    opacity: "0",
    transition: `opacity ${FADE_MS}ms ease`,
    pointerEvents: "none",
    zIndex: "9999",
  });
  document.body.appendChild(veil);
  requestAnimationFrame(() => {
    veil.style.opacity = "1";
  });
  window.setTimeout(() => {
    swap();
    veil.style.opacity = "0";
    window.setTimeout(() => veil.remove(), FADE_MS);
  }, FADE_MS);
};

/**
 * Go from slide `from` to slide `to` with `transition`. Zoom out & in pulls
 * back until both slides are in view, then flies into the new one.
 */
export const playSlideTransition = (
  api: ExcalidrawImperativeAPI,
  from: ExcalidrawFrameLikeElement | null,
  to: ExcalidrawFrameLikeElement,
  transition: SlideTransition,
  show: ShowFrames,
) => {
  switch (transition) {
    case "cut":
      show(to, false);
      return;
    case "fade": {
      const { theme, viewBackgroundColor } = api.getAppState();
      // the canvas is drawn inverted in dark mode, so its colour is not the
      // one on screen; use the dark canvas colour there instead
      fadeThrough(theme === "dark" ? "#121212" : viewBackgroundColor, () =>
        show(to, false),
      );
      return;
    }
    case "zoom":
      if (from && from.id !== to.id) {
        show([from, to], true, ZOOM_STEP_MS);
        window.setTimeout(() => show(to, true, ZOOM_STEP_MS), ZOOM_STEP_MS);
        return;
      }
      show(to, true);
      return;
    default:
      show(to, true);
  }
};

/**
 * Turn what is on screen into a new slide: a 16:9 frame centred in the view,
 * as large as fits with a small margin. Slides do not cut off their content,
 * so anything poking out of the frame still shows when presenting.
 */
export const addSlideFromView = (api: ExcalidrawImperativeAPI) => {
  const { scrollX, scrollY, zoom, width, height } = api.getAppState();
  const viewWidth = width / zoom.value;
  const viewHeight = height / zoom.value;

  let slideWidth = viewWidth * 0.9;
  let slideHeight = (slideWidth * 9) / 16;
  if (slideHeight > viewHeight * 0.9) {
    slideHeight = viewHeight * 0.9;
    slideWidth = (slideHeight * 16) / 9;
  }

  const elements = api.getSceneElements();
  const count = elements.filter((element) => element.type === "frame").length;
  const frame = newFrameElement({
    x: -scrollX + (viewWidth - slideWidth) / 2,
    y: -scrollY + (viewHeight - slideHeight) / 2,
    width: slideWidth,
    height: slideHeight,
    name: `Slide ${count + 1}`,
  });

  api.updateScene({
    // a new element has no z-order index yet; give it the next one
    elements: syncInvalidIndices([...elements, frame]),
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
};
