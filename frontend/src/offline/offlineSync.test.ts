import { beforeEach, describe, expect, it, vi } from "vitest";

const stores = vi.hoisted(() => ({
  drawings: new Map<string, any>(),
  kv: new Map<string, any>(),
}));

vi.mock("./offlineDb", () => ({
  idbGet: async (store: "drawings" | "kv", key: string) => stores[store].get(key),
  idbGetAll: async (store: "drawings" | "kv") => [...stores[store].values()],
  idbPut: async (store: "drawings" | "kv", value: any, key?: string) => {
    stores[store].set(key ?? value.id, structuredClone(value));
  },
  idbDelete: async (store: "drawings" | "kv", key: string) => {
    stores[store].delete(key);
  },
}));

vi.mock("../api", () => ({
  fetchRemoteDrawing: vi.fn(),
  putRemoteDrawing: vi.fn(),
  setDrawingOffline: vi.fn(async () => ({ offlineAt: null })),
  isAxiosError: () => false,
}));

import * as api from "../api";
import { getLocalRecord, updateLocalDrawing } from "./localDrawings";
import { isStoredOffline } from "./offlineState";
import {
  bringDrawingOnline,
  pushLocalChanges,
  takeDrawingOffline,
} from "./offlineSync";

const element = (id: string, version: number) => ({ id, version, type: "rectangle" });

const remoteDrawing = (overrides: Record<string, unknown> = {}) => ({
  id: "d1",
  name: "Board",
  collectionId: null,
  createdAt: 1,
  updatedAt: 1,
  version: 3,
  elements: [element("a", 1)],
  appState: {},
  files: { f1: { id: "f1", dataURL: "data:image/png;base64,AAA" } },
  ...overrides,
});

describe("offline sync", () => {
  beforeEach(() => {
    stores.drawings.clear();
    localStorage.clear();
    localStorage.setItem("excalidash-user", JSON.stringify({ id: "u1" }));
    vi.mocked(api.fetchRemoteDrawing).mockReset();
    vi.mocked(api.putRemoteDrawing).mockReset();
    vi.mocked(api.setDrawingOffline).mockClear();
  });

  it("flags the drawing offline and keeps a copy in the browser", async () => {
    vi.mocked(api.fetchRemoteDrawing).mockResolvedValue(remoteDrawing() as any);

    await takeDrawingOffline("d1");

    expect(api.setDrawingOffline).toHaveBeenCalledWith("d1", true);
    expect(isStoredOffline("d1")).toBe(true);
    expect((await getLocalRecord("d1"))?.pending).toEqual([]);
  });

  it("merges the server copy and only uploads images the server lacks", async () => {
    vi.mocked(api.fetchRemoteDrawing).mockResolvedValue(remoteDrawing() as any);
    await takeDrawingOffline("d1");

    // Offline: edit "a" and add an image. Meanwhile the server got "b".
    await updateLocalDrawing("d1", {
      elements: [element("a", 2)],
      files: {
        f1: { id: "f1", dataURL: "data:image/png;base64,AAA" },
        f2: { id: "f2", dataURL: "data:image/png;base64,BBB" },
      },
    });
    vi.mocked(api.fetchRemoteDrawing).mockResolvedValue(
      remoteDrawing({ version: 4, elements: [element("a", 1), element("b", 1)] }) as any,
    );
    vi.mocked(api.putRemoteDrawing).mockResolvedValue({ version: 5 } as any);

    await pushLocalChanges("d1");

    const [, payload] = vi.mocked(api.putRemoteDrawing).mock.calls[0];
    expect(payload.version).toBe(4);
    expect(payload.elements).toEqual(
      expect.arrayContaining([element("a", 2), element("b", 1)]),
    );
    expect(Object.keys(payload.files ?? {})).toEqual(["f2"]);
    const record = await getLocalRecord("d1");
    expect(record?.pending).toEqual([]);
    expect(record?.drawing.version).toBe(5);
  });

  it("keeps edits made during a push pending for the next one", async () => {
    vi.mocked(api.fetchRemoteDrawing).mockResolvedValue(remoteDrawing() as any);
    await takeDrawingOffline("d1");
    await updateLocalDrawing("d1", { name: "First" });
    vi.mocked(api.putRemoteDrawing).mockImplementation(async () => {
      await updateLocalDrawing("d1", { name: "Second" });
      return { version: 3 } as any;
    });

    await pushLocalChanges("d1");

    expect((await getLocalRecord("d1"))?.pending).toEqual(["name"]);
  });

  it("pushes the last edits before handing the drawing back to the server", async () => {
    vi.mocked(api.fetchRemoteDrawing).mockResolvedValue(remoteDrawing() as any);
    await takeDrawingOffline("d1");
    await updateLocalDrawing("d1", { name: "Renamed offline" });
    vi.mocked(api.putRemoteDrawing).mockResolvedValue({ version: 3 } as any);

    await bringDrawingOnline("d1");

    expect(api.putRemoteDrawing).toHaveBeenCalledWith("d1", { name: "Renamed offline" });
    expect(api.setDrawingOffline).toHaveBeenLastCalledWith("d1", false);
    expect(isStoredOffline("d1")).toBe(false);
    expect(stores.drawings.has("d1")).toBe(false);
  });

  it("stays offline when the server can't be reached", async () => {
    vi.mocked(api.fetchRemoteDrawing).mockResolvedValue(remoteDrawing() as any);
    await takeDrawingOffline("d1");
    await updateLocalDrawing("d1", { name: "Renamed offline" });
    vi.mocked(api.fetchRemoteDrawing).mockRejectedValue(new Error("Network Error"));

    await expect(bringDrawingOnline("d1")).rejects.toThrow("Network Error");

    expect(isStoredOffline("d1")).toBe(true);
    expect((await getLocalRecord("d1"))?.pending).toEqual(["name"]);
  });
});
