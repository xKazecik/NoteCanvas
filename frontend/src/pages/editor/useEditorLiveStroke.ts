import { useCallback, useRef } from "react";
import type { MutableRefObject } from "react";

/**
 * Broadcasts the shape currently being drawn, so peers see a stroke appear as
 * it is made rather than only once it is finished.
 *
 * Excalidraw keeps the in-progress shape in `appState.newElement` and mutates
 * it with `informMutation: false` on every pointer move, which deliberately
 * skips the React update — so `onChange`, and with it the normal broadcast and
 * save path, does not run again until pointer-up. Reading `newElement` straight
 * off the app state on each pointer move is what makes the stroke visible live.
 *
 * Nothing here is recorded as synced: the element's version is left untouched
 * so the authoritative pointer-up broadcast still goes out, still persists, and
 * still wins the reconcile on the receiving side (its version is the highest).
 */

// ~20 updates/sec. Fast enough to read as live, slow enough that a long
// freedraw (whose whole point list is resent each time) stays cheap.
const LIVE_STROKE_INTERVAL_MS = 50;

type UseEditorLiveStrokeParams = {
  drawingId: string | undefined;
  canEdit: boolean;
  excalidrawAPI: MutableRefObject<any>;
  socketRef: MutableRefObject<any>;
  socketMeRef: MutableRefObject<{ id: string }>;
};

export const useEditorLiveStroke = ({
  drawingId,
  canEdit,
  excalidrawAPI,
  socketRef,
  socketMeRef,
}: UseEditorLiveStrokeParams) => {
  const lastEmitAtRef = useRef(0);
  const lastEmittedRef = useRef<{ id: string; version: number } | null>(null);

  return useCallback(() => {
    if (!canEdit || !drawingId) return;
    const api = excalidrawAPI.current;
    const socket = socketRef.current;
    if (!api || !socket) return;

    const inProgress = api.getAppState?.()?.newElement;
    if (!inProgress || typeof inProgress.id !== "string") {
      lastEmittedRef.current = null;
      return;
    }

    const version = inProgress.version ?? 0;
    const last = lastEmittedRef.current;
    // A pointer move that did not extend the shape (hovering, or a point the
    // editor discarded as a duplicate) has nothing new to send.
    if (last && last.id === inProgress.id && last.version === version) return;

    const now = Date.now();
    if (now - lastEmitAtRef.current < LIVE_STROKE_INTERVAL_MS) return;
    lastEmitAtRef.current = now;
    lastEmittedRef.current = { id: inProgress.id, version };

    // No `elementOrder`: the order is not settled until the shape is finished,
    // and the pointer-up broadcast carries it.
    socket.emit("element-update", {
      drawingId,
      elements: [inProgress],
      userId: socketMeRef.current.id,
    });
  }, [canEdit, drawingId, excalidrawAPI, socketRef, socketMeRef]);
};
