import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorLiveStroke } from "./useEditorLiveStroke";

const makeHarness = (overrides?: { canEdit?: boolean; drawingId?: string }) => {
  const emit = vi.fn();
  const appState: { newElement: any } = { newElement: null };
  const excalidrawAPI = { current: { getAppState: () => appState } };
  const socketRef = { current: { emit } };
  const socketMeRef = { current: { id: "me" } };

  const { result } = renderHook(() =>
    useEditorLiveStroke({
      drawingId: overrides?.drawingId ?? "d1",
      canEdit: overrides?.canEdit ?? true,
      excalidrawAPI: excalidrawAPI as any,
      socketRef: socketRef as any,
      socketMeRef: socketMeRef as any,
    }),
  );

  return { emit, appState, emitLiveStroke: () => result.current() };
};

describe("useEditorLiveStroke", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits the in-progress element so peers see the stroke as it is drawn", () => {
    const { emit, appState, emitLiveStroke } = makeHarness();
    appState.newElement = { id: "el1", version: 3, type: "freedraw" };

    emitLiveStroke();

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith("element-update", {
      drawingId: "d1",
      elements: [appState.newElement],
      userId: "me",
    });
  });

  it("sends no elementOrder, which the pointer-up broadcast owns", () => {
    const { emit, appState, emitLiveStroke } = makeHarness();
    appState.newElement = { id: "el1", version: 1 };

    emitLiveStroke();

    expect(emit.mock.calls[0][1]).not.toHaveProperty("elementOrder");
  });

  it("stays quiet when nothing is being drawn", () => {
    const { emit, emitLiveStroke } = makeHarness();

    emitLiveStroke();

    expect(emit).not.toHaveBeenCalled();
  });

  it("throttles while the shape keeps growing", () => {
    const { emit, appState, emitLiveStroke } = makeHarness();
    appState.newElement = { id: "el1", version: 1 };
    emitLiveStroke();

    appState.newElement = { id: "el1", version: 2 };
    emitLiveStroke();
    expect(emit).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(50);
    appState.newElement = { id: "el1", version: 3 };
    emitLiveStroke();
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit.mock.calls[1][1].elements[0].version).toBe(3);
  });

  it("does not resend a shape that has not changed", () => {
    const { emit, appState, emitLiveStroke } = makeHarness();
    appState.newElement = { id: "el1", version: 7 };
    emitLiveStroke();

    vi.advanceTimersByTime(500);
    emitLiveStroke();

    expect(emit).toHaveBeenCalledTimes(1);
  });

  it("emits again immediately for the next shape after one finishes", () => {
    const { emit, appState, emitLiveStroke } = makeHarness();
    appState.newElement = { id: "el1", version: 9 };
    emitLiveStroke();
    expect(emit).toHaveBeenCalledTimes(1);

    // Pointer up clears newElement, then a new shape starts.
    appState.newElement = null;
    emitLiveStroke();
    vi.advanceTimersByTime(50);
    appState.newElement = { id: "el2", version: 1 };
    emitLiveStroke();

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit.mock.calls[1][1].elements[0].id).toBe("el2");
  });

  it("never broadcasts for a viewer who cannot edit", () => {
    const { emit, appState, emitLiveStroke } = makeHarness({ canEdit: false });
    appState.newElement = { id: "el1", version: 1 };

    emitLiveStroke();

    expect(emit).not.toHaveBeenCalled();
  });
});
