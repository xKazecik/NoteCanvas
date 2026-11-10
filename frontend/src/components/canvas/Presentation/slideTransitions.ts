import {
  CaptureUpdateAction,
  newElementWith,
  newFrameElement,
  syncInvalidIndices,
} from "@excalidraw/element";

import type { t } from "@excalidraw/excalidraw";
import type {
  ExcalidrawElement,
  ExcalidrawFrameLikeElement,
} from "@excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import {
  animateCamera,
  applyCamera,
  cameraForBox,
  cancelCameraAnimation,
  readCamera,
  unionBox,
} from "./slideCamera";

type Label = Parameters<typeof t>[0];

export type SlideTransition =
  | "smooth"
  | "cut"
  | "fade"
  | "fadeBlack"
  | "dissolve"
  | "slide"
  | "zoom";

export const SLIDE_TRANSITIONS: { id: SlideTransition; label: Label }[] = [
  { id: "smooth", label: "presentation.transitionSmooth" },
  { id: "cut", label: "presentation.transitionCut" },
  { id: "dissolve", label: "presentation.transitionDissolve" },
  { id: "fade", label: "presentation.transitionFade" },
  { id: "fadeBlack", label: "presentation.transitionFadeBlack" },
  { id: "slide", label: "presentation.transitionSlide" },
  { id: "zoom", label: "presentation.transitionZoom" },
];

export type SlideSpeed = "fast" | "normal" | "slow";

export const SLIDE_SPEEDS: { id: SlideSpeed; label: Label; ms: number }[] = [
  { id: "fast", label: "presentation.speedFast", ms: 400 },
  { id: "normal", label: "presentation.speedNormal", ms: 800 },
  { id: "slow", label: "presentation.speedSlow", ms: 1600 },
];

/**
 * Everything a slide remembers lives in its frame's `customData`, so it saves
 * and syncs with the drawing and needs nothing from the backend.
 */
export type SlideData = {
  /** How the presentation arrives on this slide. */
  slideTransition: SlideTransition;
  slideSpeed: SlideSpeed;
  /** Left out when presenting, but kept in the panel. */
  slideHidden: boolean;
  /** Position in the presentation; lower comes first. */
  slideOrder: number;
};

/** Slides without a transition glide, as they did before there was a choice. */
export const getSlideTransition = (
  frame: ExcalidrawFrameLikeElement,
): SlideTransition => {
  const value = frame.customData?.slideTransition;
  return SLIDE_TRANSITIONS.some((transition) => transition.id === value)
    ? value
    : "smooth";
};

export const getSlideSpeed = (frame: ExcalidrawFrameLikeElement): SlideSpeed => {
  const value = frame.customData?.slideSpeed;
  return SLIDE_SPEEDS.some((speed) => speed.id === value) ? value : "normal";
};

export const getSlideDuration = (frame: ExcalidrawFrameLikeElement): number =>
  SLIDE_SPEEDS.find((speed) => speed.id === getSlideSpeed(frame))!.ms;

/** The tilt a slide is shown at; slides are level unless they say otherwise. */
export const getSlideAngle = (
  frame: Pick<ExcalidrawFrameLikeElement, "angle">,
): number => {
  // a frame's angle turns it clockwise on screen, and the view's tilt counts
  // counter-clockwise, so the tilt that levels a frame is its angle in degrees
  const degrees = ((frame.angle ?? 0) * 180) / Math.PI;
  return Math.round(((degrees % 360) + 360) % 360 * 1000) / 1000;
};

/**
 * Where the presentation camera goes for a slide: centred on its frame, as
 * large as fits, with the view tilted so that a rotated frame is level.
 */
export const cameraForSlide = (
  frame: Pick<ExcalidrawFrameLikeElement, "x" | "y" | "width" | "height" | "angle">,
  viewport: { width: number; height: number },
) => ({ ...cameraForBox(frame, viewport), angle: getSlideAngle(frame) });

/** The scene-aligned box a frame covers, rotation included. */
export const getFrameBox = (
  frame: Pick<ExcalidrawFrameLikeElement, "x" | "y" | "width" | "height" | "angle">,
) => {
  const cos = Math.abs(Math.cos(frame.angle ?? 0));
  const sin = Math.abs(Math.sin(frame.angle ?? 0));
  const width = frame.width * cos + frame.height * sin;
  const height = frame.width * sin + frame.height * cos;
  return {
    x: frame.x + frame.width / 2 - width / 2,
    y: frame.y + frame.height / 2 - height / 2,
    width,
    height,
  };
};

export const isSlideHidden = (frame: ExcalidrawFrameLikeElement): boolean =>
  frame.customData?.slideHidden === true;

/** "3. Intro" -> 3. Slide order used to be kept as a prefix on the name. */
const legacyOrder = (name: string | null): number => {
  const match = name?.match(/^(\d+)\.\s*/);
  return match ? parseInt(match[1], 10) : Infinity;
};

const storedOrder = (frame: ExcalidrawFrameLikeElement): number => {
  const value = frame.customData?.slideOrder;
  return typeof value === "number" && Number.isFinite(value) ? value : Infinity;
};

/**
 * Every frame of the scene as a slide, in presentation order: slides that
 * were arranged in the panel first, in that order, then the rest by the number
 * their name starts with, then by name.
 */
export const getOrderedSlides = (
  elements: readonly ExcalidrawElement[],
): ExcalidrawFrameLikeElement[] =>
  (
    elements.filter(
      (element) => element.type === "frame" && !element.isDeleted,
    ) as ExcalidrawFrameLikeElement[]
  ).sort(
    (a, b) =>
      // `||` rather than subtraction alone: Infinity - Infinity is NaN
      (storedOrder(a) === storedOrder(b) ? 0 : storedOrder(a) - storedOrder(b)) ||
      (legacyOrder(a.name) === legacyOrder(b.name)
        ? 0
        : legacyOrder(a.name) - legacyOrder(b.name)) ||
      (a.name || `Frame ${a.id}`).localeCompare(
        b.name || `Frame ${b.id}`,
        undefined,
        { numeric: true },
      ),
  );

const updateFrames = (
  api: ExcalidrawImperativeAPI,
  patchFor: (frame: ExcalidrawElement) => Partial<SlideData> | null,
) => {
  api.updateScene({
    elements: api.getSceneElementsIncludingDeleted().map((element) => {
      const patch = element.type === "frame" ? patchFor(element) : null;
      return patch
        ? newElementWith(element, {
            customData: { ...element.customData, ...patch },
          })
        : element;
    }),
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
};

export const setSlideData = (
  api: ExcalidrawImperativeAPI,
  frameId: string,
  patch: Partial<SlideData>,
) => updateFrames(api, (frame) => (frame.id === frameId ? patch : null));

/** Store a new presentation order: the frame ids, first slide first. */
export const setSlideOrder = (
  api: ExcalidrawImperativeAPI,
  orderedIds: readonly string[],
) =>
  updateFrames(api, (frame) => {
    const slideOrder = orderedIds.indexOf(frame.id);
    return slideOrder === -1 || frame.customData?.slideOrder === slideOrder
      ? null
      : { slideOrder };
  });

// ---------------------------------------------------------------------------
// Playing a transition
// ---------------------------------------------------------------------------

const OVERLAY_Z_INDEX = "9998"; // under the presentation controls (9999)

let removeOverlay: (() => void) | null = null;

/** An element covering exactly the canvas, removed by the next transition. */
const addOverlay = <T extends HTMLElement>(node: T): T | null => {
  const canvas = document.querySelector<HTMLCanvasElement>(
    ".excalidraw canvas.static, .excalidraw__canvas-wrapper canvas",
  );
  const rect = canvas?.getBoundingClientRect();
  if (!rect) {
    return null;
  }
  Object.assign(node.style, {
    position: "fixed",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    pointerEvents: "none",
    zIndex: OVERLAY_Z_INDEX,
  });
  document.body.appendChild(node);
  removeOverlay = () => {
    node.remove();
    removeOverlay = null;
  };
  return node;
};

/** A still picture of what the canvas shows right now, laid over it. */
const addSnapshot = (): HTMLCanvasElement | null => {
  const source = document.querySelector<HTMLCanvasElement>(
    ".excalidraw canvas.static, .excalidraw__canvas-wrapper canvas",
  );
  if (!source || !source.width || !source.height) {
    return null;
  }
  const copy = document.createElement("canvas");
  copy.width = source.width;
  copy.height = source.height;
  copy.getContext("2d")?.drawImage(source, 0, 0);
  return addOverlay(copy);
};

/** Run `callback` once `node`'s CSS transition has finished. */
const afterTransition = (duration: number, callback: () => void) =>
  window.setTimeout(callback, duration + 30);

/** Stop any transition that is still playing, leaving the camera where it is. */
export const cancelSlideTransition = () => {
  cancelCameraAnimation();
  removeOverlay?.();
};

/**
 * Go from slide `from` to slide `to`.
 *
 * `direction` is 1 when moving forward through the presentation and -1 when
 * going back, which is the way a sliding transition travels.
 */
export const playSlideTransition = (
  api: ExcalidrawImperativeAPI,
  from: ExcalidrawFrameLikeElement | null,
  to: ExcalidrawFrameLikeElement,
  options: { transition: SlideTransition; duration: number; direction?: 1 | -1 },
) => {
  cancelSlideTransition();

  const { width, height, theme, viewBackgroundColor } = api.getAppState();
  const viewport = { width, height };
  const target = cameraForSlide(to, viewport);
  const { transition, duration, direction = 1 } = options;
  const cut = () => applyCamera(api, target);

  if (!from || from.id === to.id) {
    // nothing to transition from: arriving on the first slide, or a resize
    animateCamera(api, target, transition === "cut" ? 0 : duration);
    return;
  }

  switch (transition) {
    case "cut":
      cut();
      return;

    case "zoom":
      animateCamera(
        api,
        target,
        // further to travel than a plain glide, so it gets a little longer
        duration * 1.5,
        cameraForBox(
          unionBox([getFrameBox(from), getFrameBox(to)]),
          viewport,
          getSlideAngle(to),
        ).zoom *
          0.9,
      );
      return;

    case "fade":
    case "fadeBlack": {
      const veil = addOverlay(document.createElement("div"));
      if (!veil) {
        cut();
        return;
      }
      const half = duration / 2;
      // the canvas is drawn inverted in dark mode, so its colour is not the
      // one on screen; use the dark canvas colour there instead
      const background = theme === "dark" ? "#121212" : viewBackgroundColor;
      veil.style.background = transition === "fadeBlack" ? "#000" : background;
      veil.style.opacity = "0";
      veil.style.transition = `opacity ${half}ms ease`;
      requestAnimationFrame(() => {
        veil.style.opacity = "1";
      });
      afterTransition(half, () => {
        if (!veil.isConnected) {
          return;
        }
        cut();
        veil.style.opacity = "0";
        afterTransition(half, () => veil.remove());
      });
      return;
    }

    case "dissolve":
    case "slide": {
      // the old slide stays on screen as a picture while the canvas beneath
      // it has already moved on, then the picture fades or slides away
      const snapshot = addSnapshot();
      cut();
      if (!snapshot) {
        return;
      }
      snapshot.style.transition =
        transition === "dissolve"
          ? `opacity ${duration}ms ease`
          : `transform ${duration}ms cubic-bezier(0.65, 0, 0.35, 1)`;
      // two frames: one for the canvas to paint the new slide, one for the
      // browser to register the picture's starting state
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (transition === "dissolve") {
            snapshot.style.opacity = "0";
          } else {
            snapshot.style.transform = `translateX(${-100 * direction}%)`;
          }
        }),
      );
      afterTransition(duration + 40, () => snapshot.remove());
      return;
    }

    default:
      animateCamera(api, target, duration);
  }
};

/**
 * Turn what is on screen into a new slide: a 16:9 frame centred in the view,
 * as large as fits with a small margin, added at the end of the presentation.
 * Slides do not cut off their content, so anything poking out of the frame
 * still shows when presenting.
 */
export const addSlideFromView = (api: ExcalidrawImperativeAPI) => {
  const { zoom, width, height, viewAngle } = api.getAppState();
  // the middle of the view is the same scene point whatever the tilt
  const { centerX, centerY } = readCamera(api);
  const viewWidth = width / zoom.value;
  const viewHeight = height / zoom.value;

  let slideWidth = viewWidth * 0.9;
  let slideHeight = (slideWidth * 9) / 16;
  if (slideHeight > viewHeight * 0.9) {
    slideHeight = viewHeight * 0.9;
    slideWidth = (slideHeight * 16) / 9;
  }

  const elements = api.getSceneElements();
  const slides = getOrderedSlides(elements);
  const frame = newFrameElement({
    x: centerX - slideWidth / 2,
    y: centerY - slideHeight / 2,
    width: slideWidth,
    height: slideHeight,
    // in a tilted view the slide is level on screen, so it is rotated by the
    // tilt -- and presenting it tilts the view the same way again
    angle: ((viewAngle * Math.PI) / 180) as ExcalidrawFrameLikeElement["angle"],
    name: `Slide ${slides.length + 1}`,
    customData: { slideOrder: slides.length },
  });

  // slides with a stored position come before those without, so the existing
  // ones get theirs written down too, or the new slide would jump the queue
  const ordered = elements.map((element) => {
    const slideOrder = slides.findIndex((slide) => slide.id === element.id);
    return slideOrder === -1 || element.customData?.slideOrder === slideOrder
      ? element
      : newElementWith(element, {
          customData: { ...element.customData, slideOrder },
        });
  });

  api.updateScene({
    // a new element has no z-order index yet; give it the next one
    elements: syncInvalidIndices([...ordered, frame]),
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
};
