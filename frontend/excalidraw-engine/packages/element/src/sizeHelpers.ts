import {
  SHIFT_LOCKING_ANGLE,
  viewportCoordsToSceneCoords,
} from "@excalidraw/common";
import {
  normalizeRadians,
  radiansBetweenAngles,
  radiansDifference,
  type Radians,
} from "@excalidraw/math";

import { pointsEqual } from "@excalidraw/math";

import type { AppState, Offsets, Zoom } from "@excalidraw/excalidraw/types";

import { getCommonBounds, getElementBounds } from "./bounds";
import {
  isArrowElement,
  isFreeDrawElement,
  isLinearElement,
} from "./typeChecks";

import type { ElementsMap, ExcalidrawElement } from "./types";

export const INVISIBLY_SMALL_ELEMENT_SIZE = 0.1;

// TODO:  remove invisible elements consistently actions, so that invisible elements are not recorded by the store, exported, broadcasted or persisted
//        - perhaps could be as part of a standalone 'cleanup' action, in addition to 'finalize'
//        - could also be part of `_clearElements`
export const isInvisiblySmallElement = (
  element: ExcalidrawElement,
): boolean => {
  if (isLinearElement(element) || isFreeDrawElement(element)) {
    return (
      element.points.length < 2 ||
      (element.points.length === 2 &&
        isArrowElement(element) &&
        pointsEqual(
          element.points[0],
          element.points[element.points.length - 1],
          INVISIBLY_SMALL_ELEMENT_SIZE,
        ))
    );
  }

  return element.width === 0 && element.height === 0;
};

type ViewTransformations = {
  zoom: Zoom;
  offsetLeft: number;
  offsetTop: number;
  scrollX: number;
  scrollY: number;
  /** notecanvas: degrees the view is tilted by; absent means untilted. */
  viewAngle?: number;
};

/**
 * The scene rectangle the viewport shows, inset by `padding`. With a tilted
 * view that is the box around the tilted viewport, so anything the box holds
 * may be on screen and anything outside it is not.
 */
const getViewportSceneBox = (
  width: number,
  height: number,
  viewTransformations: ViewTransformations,
  padding?: Offsets,
): [number, number, number, number] => {
  const state = { ...viewTransformations, width, height };
  const left = viewTransformations.offsetLeft + (padding?.left || 0);
  const top = viewTransformations.offsetTop + (padding?.top || 0);
  const right =
    viewTransformations.offsetLeft + width - (padding?.right || 0);
  const bottom =
    viewTransformations.offsetTop + height - (padding?.bottom || 0);
  const corners = (
    viewTransformations.viewAngle
      ? [
          [left, top],
          [right, top],
          [right, bottom],
          [left, bottom],
        ]
      : [
          [left, top],
          [right, bottom],
        ]
  ).map(([clientX, clientY]) =>
    viewportCoordsToSceneCoords({ clientX, clientY }, state),
  );
  return [
    Math.min(...corners.map((corner) => corner.x)),
    Math.min(...corners.map((corner) => corner.y)),
    Math.max(...corners.map((corner) => corner.x)),
    Math.max(...corners.map((corner) => corner.y)),
  ];
};

export const isElementInViewport = (
  element: ExcalidrawElement,
  width: number,
  height: number,
  viewTransformations: ViewTransformations,
  elementsMap: ElementsMap,
) => {
  const [x1, y1, x2, y2] = getElementBounds(element, elementsMap); // scene coordinates
  const [left, top, right, bottom] = getViewportSceneBox(
    width,
    height,
    viewTransformations,
  );

  return left <= x2 && top <= y2 && right >= x1 && bottom >= y1;
};

export const isElementCompletelyInViewport = (
  elements: ExcalidrawElement[],
  width: number,
  height: number,
  viewTransformations: ViewTransformations,
  elementsMap: ElementsMap,
  padding?: Offsets,
) => {
  const [x1, y1, x2, y2] = getCommonBounds(elements, elementsMap); // scene coordinates
  const [left, top, right, bottom] = getViewportSceneBox(
    width,
    height,
    viewTransformations,
    padding,
  );

  return x1 >= left && y1 >= top && x2 <= right && y2 <= bottom;
};

/**
 * Makes a perfect shape or diagonal/horizontal/vertical line
 */
export const getPerfectElementSize = (
  elementType: AppState["activeTool"]["type"],
  width: number,
  height: number,
): { width: number; height: number } => {
  const absWidth = Math.abs(width);
  const absHeight = Math.abs(height);

  if (
    elementType === "line" ||
    elementType === "arrow" ||
    elementType === "freedraw"
  ) {
    const lockedAngle =
      Math.round(Math.atan(absHeight / absWidth) / SHIFT_LOCKING_ANGLE) *
      SHIFT_LOCKING_ANGLE;
    if (lockedAngle === 0) {
      height = 0;
    } else if (lockedAngle === Math.PI / 2) {
      width = 0;
    } else {
      height = absWidth * Math.tan(lockedAngle) * Math.sign(height) || height;
    }
  } else if (elementType !== "selection") {
    height = absWidth * Math.sign(height);
  }
  return { width, height };
};

export const getLockedLinearCursorAlignSize = (
  originX: number,
  originY: number,
  x: number,
  y: number,
  customAngle?: number,
) => {
  let width = x - originX;
  let height = y - originY;

  const angle = Math.atan2(height, width) as Radians;
  let lockedAngle = (Math.round(angle / SHIFT_LOCKING_ANGLE) *
    SHIFT_LOCKING_ANGLE) as Radians;

  if (customAngle) {
    // If custom angle is provided, we check if the angle is close to the
    // custom angle, snap to that if close engough, otherwise snap to the
    // higher or lower angle depending on the current angle vs custom angle.
    const lower = (Math.floor(customAngle / SHIFT_LOCKING_ANGLE) *
      SHIFT_LOCKING_ANGLE) as Radians;
    if (
      radiansBetweenAngles(
        angle,
        lower,
        (lower + SHIFT_LOCKING_ANGLE) as Radians,
      )
    ) {
      if (
        radiansDifference(angle, customAngle as Radians) <
        SHIFT_LOCKING_ANGLE / 6
      ) {
        lockedAngle = customAngle as Radians;
      } else if (
        normalizeRadians(angle) > normalizeRadians(customAngle as Radians)
      ) {
        lockedAngle = (lower + SHIFT_LOCKING_ANGLE) as Radians;
      } else {
        lockedAngle = lower;
      }
    }
  }

  if (lockedAngle === 0) {
    height = 0;
  } else if (lockedAngle === Math.PI / 2) {
    width = 0;
  } else {
    // locked angle line, y = mx + b => mx - y + b = 0
    const a1 = Math.tan(lockedAngle);
    const b1 = -1;
    const c1 = originY - a1 * originX;

    // line through cursor, perpendicular to locked angle line
    const a2 = -1 / a1;
    const b2 = -1;
    const c2 = y - a2 * x;

    // intersection of the two lines above
    const intersectX = (b1 * c2 - b2 * c1) / (a1 * b2 - a2 * b1);
    const intersectY = (c1 * a2 - c2 * a1) / (a1 * b2 - a2 * b1);

    // delta
    width = intersectX - originX;
    height = intersectY - originY;
  }

  return { width, height };
};

export const getNormalizedDimensions = (
  element: Pick<ExcalidrawElement, "width" | "height" | "x" | "y">,
): {
  width: ExcalidrawElement["width"];
  height: ExcalidrawElement["height"];
  x: ExcalidrawElement["x"];
  y: ExcalidrawElement["y"];
} => {
  const ret = {
    width: element.width,
    height: element.height,
    x: element.x,
    y: element.y,
  };

  if (element.width < 0) {
    const nextWidth = Math.abs(element.width);
    ret.width = nextWidth;
    ret.x = element.x - nextWidth;
  }

  if (element.height < 0) {
    const nextHeight = Math.abs(element.height);
    ret.height = nextHeight;
    ret.y = element.y - nextHeight;
  }

  return ret;
};
