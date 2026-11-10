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
  createRemoteDrawing: vi.fn(),
  getDrawings: vi.fn(),
  getSharedDrawings: vi.fn(),
  getCollections: vi.fn(),
  isAxiosError: vi.fn(() => false),
}));

import * as api from "../api";
import {
  createLocalDrawing,
  getLocalRecord,
  isPendingCreate,
  updateLocalDrawing,
} from "./localDrawings";
import { listFromSnapshot } from "./offlineSnapshot";
import { isStoredOffline } from "./offlineState";
import {
  bringDrawingOnline,
  pushLocalChanges,
  syncAllLocalChanges,
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
    vi.mocked(api.createRemoteDrawing).mockReset();
    vi.mocked(api.isAxiosError).mockReturnValue(false);
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

  describe("a drawing made while offline", () => {
    it("lives in the browser, under an id of its own, until it syncs", async () => {
      const drawing = await createLocalDrawing("Sketch", "c1");

      expect(isStoredOffline(drawing.id)).toBe(true);
      expect(await isPendingCreate(drawing.id)).toBe(true);
      expect(api.createRemoteDrawing).not.toHaveBeenCalled();
      // and it shows up on the dashboard, in the collection it was made in
      const listed = await listFromSnapshot({
        search: "",
        selectedCollectionId: "c1",
        sortField: "updatedAt",
        sortDirection: "desc",
      });
      expect(listed.drawings.map((d) => d.id)).toEqual([drawing.id]);
    });

    it("is created on the server with its id and everything drawn so far", async () => {
      const { id } = await createLocalDrawing("Sketch", null);
      await updateLocalDrawing(id, { elements: [element("a", 1)], name: "Plan" });
      vi.mocked(api.createRemoteDrawing).mockResolvedValue({ version: 1 } as any);

      await pushLocalChanges(id);

      expect(api.createRemoteDrawing).toHaveBeenCalledWith(
        expect.objectContaining({
          id,
          name: "Plan",
          collectionId: null,
          elements: [element("a", 1)],
        }),
      );
      // from here it is an ordinary offline copy: flagged on the server, clean
      expect(api.setDrawingOffline).toHaveBeenCalledWith(id, true);
      expect(await isPendingCreate(id)).toBe(false);
      expect((await getLocalRecord(id))?.pending).toEqual([]);
      expect(isStoredOffline(id)).toBe(true);
    });

    it("sends edits made during the create as a normal update afterwards", async () => {
      const { id } = await createLocalDrawing("Sketch", null);
      vi.mocked(api.createRemoteDrawing).mockImplementation(async () => {
        await updateLocalDrawing(id, { name: "Renamed meanwhile" });
        return { version: 1 } as any;
      });

      await pushLocalChanges(id);

      const record = await getLocalRecord(id);
      expect(record?.pendingCreate).toBe(false);
      expect(record?.pending).toEqual(["name"]);
    });

    it("lands at the root when its collection is gone", async () => {
      const { id } = await createLocalDrawing("Sketch", "deleted-collection");
      vi.mocked(api.isAxiosError).mockReturnValue(true);
      vi.mocked(api.createRemoteDrawing)
        .mockRejectedValueOnce({ response: { status: 404 } })
        .mockResolvedValueOnce({ version: 1 } as any);

      await pushLocalChanges(id);

      expect(vi.mocked(api.createRemoteDrawing).mock.calls[1][0].collectionId).toBeNull();
      expect(await isPendingCreate(id)).toBe(false);
    });

    it("is kept, not dropped, while the server stays out of reach", async () => {
      const { id } = await createLocalDrawing("Sketch", null);
      vi.mocked(api.createRemoteDrawing).mockRejectedValue(new Error("Network Error"));

      expect(await syncAllLocalChanges()).toEqual({ failed: 1 });

      expect(await isPendingCreate(id)).toBe(true);
      expect(stores.drawings.has(id)).toBe(true);
    });
  });
});
