import { describe, expect, it } from "vitest";
import { newFrameElement } from "@excalidraw/element";

import {
  cameraForBox,
  interpolateCamera,
  unionBox,
} from "./slideCamera";
import {
  getOrderedSlides,
  getSlideDuration,
  getSlideSpeed,
  getSlideTransition,
  isSlideHidden,
} from "./slideTransitions";

const frame = (customData?: Record<string, unknown>, name?: string) =>
  newFrameElement({ x: 0, y: 0, width: 160, height: 90, customData, name });

describe("slide settings", () => {
  it("glides into slides that have no transition, or an unknown one", () => {
    expect(getSlideTransition(frame())).toBe("smooth");
    expect(getSlideTransition(frame({ slideTransition: "spin" }))).toBe(
      "smooth",
    );
  });

  it("reads the transition stored on the slide", () => {
    expect(getSlideTransition(frame({ slideTransition: "dissolve" }))).toBe(
      "dissolve",
    );
  });

  it("uses normal speed unless the slide says otherwise", () => {
    expect(getSlideSpeed(frame())).toBe("normal");
    expect(getSlideDuration(frame({ slideSpeed: "slow" }))).toBeGreaterThan(
      getSlideDuration(frame()),
    );
  });

  it("only skips slides explicitly marked hidden", () => {
    expect(isSlideHidden(frame())).toBe(false);
    expect(isSlideHidden(frame({ slideHidden: true }))).toBe(true);
  });
});

describe("getOrderedSlides", () => {
  const names = (frames: ReturnType<typeof frame>[]) =>
    getOrderedSlides(frames).map((slide) => slide.name);

  it("puts arranged slides first, in their stored order", () => {
    expect(
      names([
        frame(undefined, "Alpha"),
        frame({ slideOrder: 1 }, "Second"),
        frame({ slideOrder: 0 }, "First"),
      ]),
    ).toEqual(["First", "Second", "Alpha"]);
  });

  it("falls back to a number prefix on the name, then the name", () => {
    expect(
      names([
        frame(undefined, "Beta"),
        frame(undefined, "10. Late"),
        frame(undefined, "2. Early"),
        frame(undefined, "Alpha"),
      ]),
    ).toEqual(["2. Early", "10. Late", "Alpha", "Beta"]);
  });

  it("leaves out deleted frames and other elements", () => {
    const deleted = { ...frame(undefined, "Gone"), isDeleted: true };
    expect(names([deleted, frame(undefined, "Kept")])).toEqual(["Kept"]);
  });
});

describe("the presentation camera", () => {
  const viewport = { width: 800, height: 600 };

  it("fits a slide to the viewport, centred", () => {
    expect(
      cameraForBox({ x: 100, y: 100, width: 400, height: 200 }, viewport),
    ).toEqual({ centerX: 300, centerY: 200, zoom: 2, angle: 0 });
  });

  it("fits a tilted slide by its tilted outline", () => {
    // on its side, the 400x200 slide is 200 wide and 400 tall on screen
    const camera = cameraForBox(
      { x: 0, y: 0, width: 400, height: 200 },
      viewport,
      90,
    );
    expect(camera.zoom).toBeCloseTo(1.5);
    expect(camera.angle).toBe(90);
  });

  it("turns the short way between two tilts", () => {
    const at = (angle: number) => ({ centerX: 0, centerY: 0, zoom: 1, angle });
    expect(interpolateCamera(at(350), at(10), 0.5).angle).toBeCloseTo(360);
    expect(interpolateCamera(at(10), at(350), 0.5).angle).toBeCloseTo(0);
  });

  it("spans every box in a union", () => {
    expect(
      unionBox([
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 90, y: 40, width: 10, height: 10 },
      ]),
    ).toEqual({ x: 0, y: 0, width: 100, height: 50 });
  });

  it("starts and ends exactly on the two cameras", () => {
    const from = { centerX: 0, centerY: 0, zoom: 1 };
    const to = { centerX: 100, centerY: 50, zoom: 4 };
    expect(interpolateCamera(from, to, 0)).toMatchObject(from);
    expect(interpolateCamera(from, to, 1)).toMatchObject(to);
    // halfway: the centre is midway, the zoom is the geometric mean
    const mid = interpolateCamera(from, to, 0.5);
    expect(mid.centerX).toBeCloseTo(50);
    expect(mid.zoom).toBeCloseTo(2);
  });

  it("pulls back to the overview zoom mid-way, then recovers", () => {
    const from = { centerX: 0, centerY: 0, zoom: 2 };
    const to = { centerX: 1000, centerY: 0, zoom: 2 };
    expect(interpolateCamera(from, to, 0.5, 0.5).zoom).toBeCloseTo(0.5);
    expect(interpolateCamera(from, to, 1, 0.5).zoom).toBeCloseTo(2);
  });
});
