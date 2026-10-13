import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useEditorBroadcast } from "./useEditorBroadcast";

const setup = (socket: { emit: ReturnType<typeof vi.fn> } | null) => {
  const debouncedSave = vi.fn();
  const setHasSceneChangesSinceLoad = vi.fn();
  const { result } = renderHook(() =>
    useEditorBroadcast({
      drawingId: "d1",
      excalidrawAPI: { current: { getFiles: () => ({}) } },
      lastLocalChangeAtRef: { current: 0 },
      lastSyncedElementOrderSigRef: { current: "" },
      lastSyncedFilesRef: { current: {} },
      latestAppStateRef: { current: { viewBackgroundColor: "#fff" } },
      latestFilesRef: { current: {} },
      socketMeRef: { current: { id: "me" } },
      socketRef: { current: socket },
      uploadedRefs: { current: {} },
      debouncedSave,
      debouncedSavePreview: vi.fn(),
      computeElementOrderSig: (els) => els.map((el: any) => el.id).join(","),
      hasElementChanged: () => true,
      normalizeImageElementStatus: (els) => els ?? [],
      recordElementVersion: vi.fn(),
      setHasSceneChangesSinceLoad,
    }),
  );
  return { broadcast: result.current, debouncedSave, setHasSceneChangesSinceLoad };
};

describe("useEditorBroadcast", () => {
  it("saves an edit even without a live socket (board kept offline)", () => {
    const { broadcast, debouncedSave, setHasSceneChangesSinceLoad } = setup(null);

    broadcast([{ id: "a", version: 2 }]);

    expect(setHasSceneChangesSinceLoad).toHaveBeenCalled();
    expect(debouncedSave).toHaveBeenCalledWith(
      "d1",
      [{ id: "a", version: 2 }],
      expect.anything(),
      {},
    );
  });

  it("still broadcasts to collaborators when a socket is connected", () => {
    const socket = { emit: vi.fn() };
    const { broadcast, debouncedSave } = setup(socket);

    broadcast([{ id: "a", version: 2 }]);

    expect(socket.emit).toHaveBeenCalledWith(
      "element-update",
      expect.objectContaining({ drawingId: "d1" }),
    );
    expect(debouncedSave).toHaveBeenCalled();
  });
});
