import { describe, expect, it, vi } from "vitest";
import { newFrameElement } from "@excalidraw/element";

import { getSlideTransition, playSlideTransition } from "./slideTransitions";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

const frame = (customData?: Record<string, unknown>) =>
  newFrameElement({ x: 0, y: 0, width: 160, height: 90, customData });

describe("getSlideTransition", () => {
  it("glides into slides that have no transition, or an unknown one", () => {
    expect(getSlideTransition(frame())).toBe("smooth");
    expect(getSlideTransition(frame({ slideTransition: "spin" }))).toBe(
      "smooth",
    );
  });

  it("reads the transition stored on the slide", () => {
    expect(getSlideTransition(frame({ slideTransition: "fade" }))).toBe(
      "fade",
    );
  });
});

describe("playSlideTransition", () => {
  const api = {} as ExcalidrawImperativeAPI;

  it("cuts straight to the slide without animating", () => {
    const show = vi.fn();
    const to = frame();
    playSlideTransition(api, frame(), to, "cut", show);
    expect(show).toHaveBeenCalledWith(to, false);
  });

  it("zooms out over both slides, then into the new one", () => {
    vi.useFakeTimers();
    const show = vi.fn();
    const from = frame();
    const to = frame();
    playSlideTransition(api, from, to, "zoom", show);
    expect(show).toHaveBeenLastCalledWith([from, to], true, 450);
    vi.advanceTimersByTime(450);
    expect(show).toHaveBeenLastCalledWith(to, true, 450);
    vi.useRealTimers();
  });
});
