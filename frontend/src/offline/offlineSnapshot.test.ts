import { beforeEach, describe, expect, it, vi } from "vitest";

const stores = vi.hoisted(() => ({
  drawings: new Map<string, any>(),
  kv: new Map<string, any>(),
}));

vi.mock("./offlineDb", () => ({
  idbGet: async (store: "drawings" | "kv", key: string) => stores[store].get(key),
  idbGetAll: async (store: "drawings" | "kv") => [...stores[store].values()],
  idbPut: async (store: "drawings" | "kv", value: any, key?: string) => {
    stores[store].set(key ?? value.id, value);
  },
  idbDelete: async () => undefined,
}));

vi.mock("../api", () => ({}));

import { listFromSnapshot } from "./offlineSnapshot";

const summary = (id: string, name: string, collectionId: string | null, updatedAt: number) => ({
  id,
  name,
  collectionId,
  createdAt: 1,
  updatedAt,
  version: 1,
});

describe("listFromSnapshot", () => {
  beforeEach(() => {
    stores.drawings.clear();
    stores.kv.clear();
    localStorage.setItem("excalidash-user", JSON.stringify({ id: "u1" }));
    stores.kv.set("dashboard-snapshot:u1", {
      savedAt: 1,
      owned: [
        summary("root-a", "Alpha", null, 10),
        summary("root-b", "Beta", null, 20),
        summary("in-c", "Gamma", "c1", 30),
      ],
      shared: [summary("shared-1", "From a friend", null, 5)],
      inSharedCollections: [summary("other", "Theirs", "c2", 40)],
      collections: [{ id: "c1", name: "Mine", createdAt: 1 }],
    });
  });

  const query = {
    search: "",
    selectedCollectionId: undefined as string | null | undefined,
    sortField: "updatedAt" as const,
    sortDirection: "desc" as const,
  };

  it("lists the root, a collection and shared boards like the server would", async () => {
    const root = await listFromSnapshot(query);
    expect(root.drawings.map((d) => d.id)).toEqual(["root-b", "root-a"]);
    expect(root.collections).toHaveLength(1);

    const inCollection = await listFromSnapshot({ ...query, selectedCollectionId: "c2" });
    expect(inCollection.drawings.map((d) => d.id)).toEqual(["other"]);

    const shared = await listFromSnapshot({ ...query, selectedCollectionId: "shared" });
    expect(shared.drawings.map((d) => d.id)).toEqual(["shared-1"]);
  });

  it("searches and prefers the newer offline copy", async () => {
    stores.drawings.set("root-a", {
      id: "root-a",
      userId: "u1",
      drawing: { ...summary("root-a", "Alpha renamed", null, 99) },
      pending: ["name"],
      rev: 1,
      syncedAt: null,
    });

    const result = await listFromSnapshot({ ...query, search: "renamed" });
    expect(result.drawings).toEqual([
      expect.objectContaining({ id: "root-a", name: "Alpha renamed", updatedAt: 99 }),
    ]);
  });
});
