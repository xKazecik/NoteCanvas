import { describe, expect, it } from "vitest";

import type { Collection } from "../../types";
import {
  buildCollectionTree,
  collectionDescendantIds,
  getDirectChildCollections,
} from "./collectionTree";

const collection = (
  id: string,
  parentId: string | null = null,
): Collection => ({
  id,
  name: id,
  createdAt: 0,
  parentId,
});

const shape = (
  nodes: ReturnType<typeof buildCollectionTree>,
): Record<string, unknown>[] =>
  nodes.map((node) => ({
    id: node.collection.id,
    depth: node.depth,
    children: shape(node.children),
  }));

describe("buildCollectionTree", () => {
  it("nests children under their parent", () => {
    const tree = buildCollectionTree([
      collection("root"),
      collection("child", "root"),
      collection("grandchild", "child"),
    ]);

    expect(shape(tree)).toEqual([
      {
        id: "root",
        depth: 0,
        children: [
          {
            id: "child",
            depth: 1,
            children: [{ id: "grandchild", depth: 2, children: [] }],
          },
        ],
      },
    ]);
  });

  it("keeps a collection whose parent is missing as a root", () => {
    // A collection shared out of someone else's tree arrives without its parent.
    const tree = buildCollectionTree([collection("shared", "not-visible")]);

    expect(shape(tree)).toEqual([{ id: "shared", depth: 0, children: [] }]);
  });

  it("preserves the input order between siblings", () => {
    const tree = buildCollectionTree([
      collection("b"),
      collection("a"),
      collection("c"),
    ]);

    expect(tree.map((node) => node.collection.id)).toEqual(["b", "a", "c"]);
  });

  it("does not recurse forever on a cycle", () => {
    const tree = buildCollectionTree([
      collection("a", "b"),
      collection("b", "a"),
    ]);

    // Both fall back to roots rather than hanging the render.
    expect(tree.map((node) => node.collection.id).sort()).toEqual(["a", "b"]);
  });

  it("treats a null parent as a root", () => {
    const tree = buildCollectionTree([collection("solo", null)]);

    expect(shape(tree)).toEqual([{ id: "solo", depth: 0, children: [] }]);
  });
});

describe("getDirectChildCollections", () => {
  const collections = [
    collection("root"),
    collection("child", "root"),
    collection("grandchild", "child"),
    collection("shared", "not-visible"),
  ];

  it("returns roots for a null parent, including one whose parent is missing", () => {
    expect(
      getDirectChildCollections(collections, null).map((c) => c.id),
    ).toEqual(["root", "shared"]);
  });

  it("returns only direct children, not the whole subtree", () => {
    expect(
      getDirectChildCollections(collections, "root").map((c) => c.id),
    ).toEqual(["child"]);
  });

  it("returns nothing for a leaf", () => {
    expect(getDirectChildCollections(collections, "grandchild")).toEqual([]);
  });
});

describe("collectionDescendantIds", () => {
  it("returns the whole subtree below a collection", () => {
    const collections = [
      collection("root"),
      collection("child", "root"),
      collection("grandchild", "child"),
      collection("elsewhere"),
    ];

    expect(collectionDescendantIds(collections, "root")).toEqual(
      new Set(["child", "grandchild"]),
    );
  });

  it("returns nothing for a leaf", () => {
    expect(
      collectionDescendantIds([collection("leaf")], "leaf"),
    ).toEqual(new Set());
  });
});
