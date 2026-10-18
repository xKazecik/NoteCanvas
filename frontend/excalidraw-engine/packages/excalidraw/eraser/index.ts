import {
  arrayToMap,
  easeOut,
  getSizeFromPoints,
  randomId,
  randomInteger,
  THEME,
} from "@excalidraw/common";

import {
  computeBoundTextPosition,
  doBoundsIntersect,
  getBoundTextElement,
  getElementAbsoluteCoords,
  getElementBounds,
  getElementLineSegments,
  getFreedrawOutlineAsSegments,
  getFreedrawOutlinePoints,
  intersectElementWithLineSegment,
  isArrowElement,
  isFreeDrawElement,
  isLineElement,
  isPointInElement,
  newElementWith,
  syncMovedIndices,
} from "@excalidraw/element";
import {
  distanceToLineSegment,
  lineSegment,
  lineSegmentsDistance,
  pointDistance,
  pointFrom,
  pointRotateRads,
} from "@excalidraw/math";

import { getElementsInGroup } from "@excalidraw/element";

import {
  isIframeLikeElement,
  isImageElement,
  isTextElement,
} from "@excalidraw/element";
import { hasBoundTextElement, isBoundToContainer } from "@excalidraw/element";
import { getBoundTextElementId } from "@excalidraw/element";

import type { Bounds } from "@excalidraw/element";

import type {
  GlobalPoint,
  LineSegment,
  LocalPoint,
  Radians,
} from "@excalidraw/math/types";
import type {
  ElementsMap,
  ExcalidrawElement,
  ExcalidrawFreeDrawElement,
} from "@excalidraw/element/types";

import { AnimatedTrail } from "../animated-trail";

import type { AnimationFrameHandler } from "../animation-frame-handler";

import type App from "../components/App";

export class EraserTrail extends AnimatedTrail {
  private elementsToErase: Set<ExcalidrawElement["id"]> = new Set();
  private groupsToErase: Set<ExcalidrawElement["id"]> = new Set();
  /** whether the current eraser path has cut into any pencil/marker stroke */
  hasErasedStrokeSegments = false;

  constructor(animationFrameHandler: AnimationFrameHandler, app: App) {
    super(animationFrameHandler, app, {
      streamline: 0.2,
      size: 5,
      keepHead: true,
      sizeMapping: (c) => {
        const DECAY_TIME = 200;
        const DECAY_LENGTH = 10;
        const t = Math.max(
          0,
          1 - (performance.now() - c.pressure) / DECAY_TIME,
        );
        const l =
          (DECAY_LENGTH -
            Math.min(DECAY_LENGTH, c.totalLength - c.currentIndex)) /
          DECAY_LENGTH;

        return Math.min(easeOut(l), easeOut(t));
      },
      fill: () =>
        app.state.theme === THEME.LIGHT
          ? "rgba(0, 0, 0, 0.2)"
          : "rgba(255, 255, 255, 0.2)",
    });
  }

  startPath(x: number, y: number): void {
    this.endPath();
    super.startPath(x, y);
    this.elementsToErase.clear();
    this.hasErasedStrokeSegments = false;
  }

  addPointToPath(x: number, y: number, restore = false) {
    super.addPointToPath(x, y);

    const elementsToEraser = this.updateElementsToBeErased(restore);

    return elementsToEraser;
  }

  private updateElementsToBeErased(restoreToErase?: boolean) {
    const eraserPath: GlobalPoint[] =
      super
        .getCurrentTrail()
        ?.originalPoints?.map((p) => pointFrom<GlobalPoint>(p[0], p[1])) || [];

    if (eraserPath.length < 2) {
      return [];
    }

    // for efficiency and avoid unnecessary calculations,
    // take only POINTS_ON_TRAIL points to form some number of segments
    const pathSegment = lineSegment<GlobalPoint>(
      eraserPath[eraserPath.length - 1],
      eraserPath[eraserPath.length - 2],
    );

    if (!restoreToErase) {
      this.eraseStrokeSegments(pathSegment);
    }

    const candidateElements = this.app.visibleElements.filter(
      (el) => !el.locked,
    );

    const candidateElementsMap = arrayToMap(candidateElements);

    for (const element of candidateElements) {
      // pencil and marker strokes are cut by eraseStrokeSegments() instead of
      // being erased whole
      if (isFreeDrawElement(element)) {
        continue;
      }

      // restore only if already added to the to-be-erased set
      if (restoreToErase && this.elementsToErase.has(element.id)) {
        const intersects = eraserTest(
          pathSegment,
          element,
          candidateElementsMap,
          this.app.state.zoom.value,
        );

        if (intersects) {
          const shallowestGroupId = element.groupIds.at(-1)!;

          if (this.groupsToErase.has(shallowestGroupId)) {
            const elementsInGroup = getElementsInGroup(
              this.app.scene.getNonDeletedElementsMap(),
              shallowestGroupId,
            );
            for (const elementInGroup of elementsInGroup) {
              this.elementsToErase.delete(elementInGroup.id);
            }
            this.groupsToErase.delete(shallowestGroupId);
          }

          if (isBoundToContainer(element)) {
            this.elementsToErase.delete(element.containerId);
          }

          if (hasBoundTextElement(element)) {
            const boundText = getBoundTextElementId(element);

            if (boundText) {
              this.elementsToErase.delete(boundText);
            }
          }

          this.elementsToErase.delete(element.id);
        }
      } else if (!restoreToErase && !this.elementsToErase.has(element.id)) {
        const intersects = eraserTest(
          pathSegment,
          element,
          candidateElementsMap,
          this.app.state.zoom.value,
        );

        if (intersects) {
          const shallowestGroupId = element.groupIds.at(-1)!;

          if (!this.groupsToErase.has(shallowestGroupId)) {
            const elementsInGroup = getElementsInGroup(
              this.app.scene.getNonDeletedElementsMap(),
              shallowestGroupId,
            );

            for (const elementInGroup of elementsInGroup) {
              this.elementsToErase.add(elementInGroup.id);
            }
            this.groupsToErase.add(shallowestGroupId);
          }

          if (hasBoundTextElement(element)) {
            const boundText = getBoundTextElementId(element);

            if (boundText) {
              this.elementsToErase.add(boundText);
            }
          }

          if (isBoundToContainer(element)) {
            this.elementsToErase.add(element.containerId);
          }

          this.elementsToErase.add(element.id);
        }
      }
    }

    return Array.from(this.elementsToErase);
  }

  /**
   * Erases only the parts of pencil and marker strokes that the eraser
   * segment passes over, splitting a stroke in two where it's crossed in the
   * middle. Unlike shapes, which are erased on pointer up, this is applied
   * to the scene right away so the stroke visibly disappears under the eraser.
   */
  eraseStrokeSegments(eraserSegment: LineSegment<GlobalPoint>) {
    const elementsMap = this.app.scene.getNonDeletedElementsMap();
    const tolerance = Math.max(2.25, 5 / this.app.state.zoom.value);
    const replacements = new Map<
      ExcalidrawElement["id"],
      ExcalidrawElement[]
    >();
    const createdElements: ExcalidrawElement[] = [];

    // read from the scene rather than visibleElements, which still holds the
    // strokes from before the previous cut until the next render
    for (const element of this.app.scene.getNonDeletedElements()) {
      if (
        !isFreeDrawElement(element) ||
        element.locked ||
        // already going as part of an erased group
        this.elementsToErase.has(element.id)
      ) {
        continue;
      }

      const pieces = splitFreedrawByEraser(
        element,
        eraserSegment,
        elementsMap,
        tolerance,
      );

      if (!pieces) {
        continue;
      }

      const nextElements: ExcalidrawElement[] = pieces.map((piece, i) => {
        const [originX, originY] = piece.points[0];
        const points = piece.points.map(([x, y]) =>
          pointFrom<LocalPoint>(x - originX, y - originY),
        );
        const updated = newElementWith(element, {
          x: originX,
          y: originY,
          // the rotation is already applied to the piece's points
          angle: 0 as Radians,
          points,
          pressures: piece.pressures,
          ...getSizeFromPoints(points),
        });

        // the first piece keeps the stroke's id, the others are new strokes
        if (i === 0) {
          return updated;
        }

        const created = { ...updated, id: randomId(), seed: randomInteger() };
        createdElements.push(created);
        return created;
      });

      replacements.set(
        element.id,
        nextElements.length
          ? nextElements
          : [newElementWith(element, { isDeleted: true })],
      );
    }

    if (!replacements.size) {
      return;
    }

    const nextElements = this.app.scene
      .getElementsIncludingDeleted()
      .flatMap((element) => replacements.get(element.id) ?? element);

    syncMovedIndices(nextElements, arrayToMap(createdElements));
    this.app.scene.replaceAllElements(nextElements);
    this.hasErasedStrokeSegments = true;
  }

  endPath(): void {
    super.endPath();
    super.clearTrails();
    this.elementsToErase.clear();
    this.groupsToErase.clear();
  }
}

type StrokePiece = { points: GlobalPoint[]; pressures: number[] };

type StrokeSample = {
  point: GlobalPoint;
  pressure: number;
  /** false for points interpolated between the stroke's own points */
  original: boolean;
};

/**
 * Cuts out the part of a freedraw stroke that lies under the eraser segment.
 * Returns the remaining pieces in scene coordinates, with the element's
 * rotation applied, or null when the eraser doesn't touch the stroke.
 */
const splitFreedrawByEraser = (
  element: ExcalidrawFreeDrawElement,
  eraserSegment: LineSegment<GlobalPoint>,
  elementsMap: ElementsMap,
  tolerance: number,
): StrokePiece[] | null => {
  // depending on the pressure, the stroke outline reaches up to its full
  // size around each point (see getFreedrawOutlinePoints), so the eraser
  // can't touch any point farther away than this
  const size = element.strokeWidth * 4.25;
  const maxRadius = size + tolerance;

  // PERF: cheap bounds test first, this runs for every stroke on each move
  const [minX, minY, maxX, maxY] = getElementBounds(element, elementsMap);
  if (
    !doBoundsIntersect(
      [minX - maxRadius, minY - maxRadius, maxX + maxRadius, maxY + maxRadius],
      [
        Math.min(eraserSegment[0][0], eraserSegment[1][0]),
        Math.min(eraserSegment[0][1], eraserSegment[1][1]),
        Math.max(eraserSegment[0][0], eraserSegment[1][0]),
        Math.max(eraserSegment[0][1], eraserSegment[1][1]),
      ],
    )
  ) {
    return null;
  }

  const [, , , , cx, cy] = getElementAbsoluteCoords(element, elementsMap);
  const center = pointFrom<GlobalPoint>(cx, cy);
  const points = element.points.map(([x, y]) =>
    pointRotateRads(
      pointFrom<GlobalPoint>(element.x + x, element.y + y),
      center,
      element.angle,
    ),
  );
  const hasPressures = !element.simulatePressure;
  const pressureAt = (i: number) => element.pressures[i] ?? 0.5;
  // a cut that falls between two of the stroke's points is placed this
  // precisely, using an interpolated point
  const step = maxRadius / 8;

  // the outline segments near the eraser, to measure how thick the stroke is
  // where the eraser passes: a point's nearest outline segment is at most
  // `size` away from it
  const outlinePoints = getFreedrawOutlinePoints(element);
  const outline =
    outlinePoints.length >= 2
      ? getFreedrawOutlineAsSegments(
          element,
          outlinePoints,
          elementsMap,
        ).filter(
          (segment) =>
            lineSegmentsDistance(segment, eraserSegment) <= maxRadius + size,
        )
      : [];

  const isUnderEraser = (point: GlobalPoint) => {
    const distance = distanceToLineSegment(point, eraserSegment);
    if (distance > maxRadius) {
      return false;
    }
    // the stroke is drawn as far around a point as its nearest outline edge
    let halfWidth = size;
    for (const segment of outline) {
      halfWidth = Math.min(halfWidth, distanceToLineSegment(point, segment));
    }
    return distance <= halfWidth + tolerance;
  };

  const pieces: StrokePiece[] = [];
  let piece: StrokePiece = { points: [], pressures: [] };
  let didErase = false;
  let prevSample: StrokeSample | null = null;
  let prevKept = false;
  let lastAdded: StrokeSample | null = null;

  const add = (sample: StrokeSample) => {
    piece.points.push(sample.point);
    if (hasPressures) {
      piece.pressures.push(sample.pressure);
    }
    lastAdded = sample;
  };

  // keeps the stroke's own points, plus interpolated ones only where a piece
  // starts or ends
  const visit = (sample: StrokeSample) => {
    const kept = !isUnderEraser(sample.point);

    if (kept) {
      if (sample.original || !prevKept) {
        add(sample);
      }
    } else {
      didErase = true;
      if (prevKept && prevSample && prevSample !== lastAdded) {
        add(prevSample);
      }
      // a single point left between two cuts is too small to keep
      if (piece.points.length > 1) {
        pieces.push(piece);
      }
      piece = { points: [], pressures: [] };
    }

    prevKept = kept;
    prevSample = sample;
  };

  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const next = points[i + 1];

    visit({ point, pressure: pressureAt(i), original: true });

    if (
      next &&
      lineSegmentsDistance(lineSegment(point, next), eraserSegment) <= maxRadius
    ) {
      const count = Math.ceil(pointDistance(point, next) / step);
      for (let k = 1; k < count; k++) {
        const t = k / count;
        visit({
          point: pointFrom<GlobalPoint>(
            point[0] + (next[0] - point[0]) * t,
            point[1] + (next[1] - point[1]) * t,
          ),
          pressure: pressureAt(i) + (pressureAt(i + 1) - pressureAt(i)) * t,
          original: false,
        });
      }
    }
  }

  if (piece.points.length > 1) {
    pieces.push(piece);
  }

  return didErase ? pieces : null;
};

const eraserTest = (
  pathSegment: LineSegment<GlobalPoint>,
  element: ExcalidrawElement,
  elementsMap: ElementsMap,
  zoom: number,
): boolean => {
  const lastPoint = pathSegment[1];

  // PERF: Do a quick bounds intersection test first because it's cheap
  const threshold = element.strokeWidth / 2;
  const segmentBounds = [
    Math.min(pathSegment[0][0], pathSegment[1][0]) - threshold,
    Math.min(pathSegment[0][1], pathSegment[1][1]) - threshold,
    Math.max(pathSegment[0][0], pathSegment[1][0]) + threshold,
    Math.max(pathSegment[0][1], pathSegment[1][1]) + threshold,
  ] as Bounds;
  const origElementBounds = getElementBounds(element, elementsMap);
  const elementBounds: Bounds = [
    origElementBounds[0] - threshold,
    origElementBounds[1] - threshold,
    origElementBounds[2] + threshold,
    origElementBounds[3] + threshold,
  ];

  if (!doBoundsIntersect(segmentBounds, elementBounds)) {
    return false;
  }

  // Text, images and browsers have no outline to cross, so their inner area
  // triggers erasing. A filled shape or a table only goes when the eraser
  // crosses its border; otherwise erasing a pencil stroke drawn on top of a
  // filled rectangle would take the rectangle with it.
  if (
    (isTextElement(element) ||
      isImageElement(element) ||
      isIframeLikeElement(element)) &&
    isPointInElement(lastPoint, element, elementsMap)
  ) {
    return true;
  }

  const boundTextElement = getBoundTextElement(element, elementsMap);

  if (isArrowElement(element) || (isLineElement(element) && !element.polygon)) {
    const tolerance = Math.max(
      element.strokeWidth,
      (element.strokeWidth * 2) / zoom,
    );

    // If the eraser movement is so fast that a large distance is covered
    // between the last two points, the distanceToElement miss, so we test
    // agaist each segment of the linear element
    const segments = getElementLineSegments(element, elementsMap);
    for (const seg of segments) {
      if (lineSegmentsDistance(seg, pathSegment) <= tolerance) {
        return true;
      }
    }

    return false;
  }

  return (
    intersectElementWithLineSegment(element, elementsMap, pathSegment, 0, true)
      .length > 0 ||
    (!!boundTextElement &&
      intersectElementWithLineSegment(
        {
          ...boundTextElement,
          ...computeBoundTextPosition(element, boundTextElement, elementsMap),
        },
        elementsMap,
        pathSegment,
        0,
        true,
      ).length > 0)
  );
};
