import type { Collection } from "../../types";

export interface CollectionTreeNode {
  collection: Collection;
  children: CollectionTreeNode[];
  depth: number;
}

/**
 * Turns the flat list the API returns into the nesting the sidebar renders.
 *
 * A collection whose parent is not in the list is treated as a root. That is the
 * normal case for a collection shared with you out of someone else's tree: you
 * can see the child without being able to see the folder it sits in.
 *
 * Sibling order follows the order of the input, so whatever the API sorted by
 * carries through.
 */
export const buildCollectionTree = (
  collections: Collection[],
): CollectionTreeNode[] => {
  const byId = new Map<string, Collection>();
  for (const collection of collections) {
    byId.set(collection.id, collection);
  }

  // The server rejects cycles, but a stale client cache could still hold one and
  // recursing into it would hang the render.
  const parentOf = (collection: Collection): string | null => {
    const parentId = collection.parentId ?? null;
    if (!parentId || !byId.has(parentId)) return null;

    const seen = new Set<string>([collection.id]);
    let cursor: string | null = parentId;
    while (cursor) {
      if (seen.has(cursor)) return null;
      seen.add(cursor);
      cursor = byId.get(cursor)?.parentId ?? null;
    }
    return parentId;
  };

  const childrenOf = new Map<string | null, Collection[]>();
  for (const collection of collections) {
    const key = parentOf(collection);
    const bucket = childrenOf.get(key);
    if (bucket) {
      bucket.push(collection);
    } else {
      childrenOf.set(key, [collection]);
    }
  }

  const build = (parentId: string | null, depth: number): CollectionTreeNode[] =>
    (childrenOf.get(parentId) ?? []).map((collection) => ({
      collection,
      children: build(collection.id, depth + 1),
      depth,
    }));

  return build(null, 0);
};

/**
 * Every collection below `id`. Moving a collection into one of these would
 * detach the subtree, so the UI leaves them out of the move targets.
 */
export const collectionDescendantIds = (
  collections: Collection[],
  id: string,
): Set<string> => {
  const descendants = new Set<string>();
  const childrenOf = new Map<string, Collection[]>();
  for (const collection of collections) {
    const parentId = collection.parentId ?? null;
    if (!parentId) continue;
    const bucket = childrenOf.get(parentId);
    if (bucket) {
      bucket.push(collection);
    } else {
      childrenOf.set(parentId, [collection]);
    }
  }

  const walk = (currentId: string) => {
    for (const child of childrenOf.get(currentId) ?? []) {
      if (descendants.has(child.id)) continue;
      descendants.add(child.id);
      walk(child.id);
    }
  };
  walk(id);

  return descendants;
};
