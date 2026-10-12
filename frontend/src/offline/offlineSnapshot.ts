import * as api from "../api";
import type { DrawingSortField, PaginatedDrawings, SortDirection } from "../api";
import type { Collection, DrawingSummary } from "../types";
import { getLocalRecords } from "./localDrawings";
import { idbGet, idbPut } from "./offlineDb";
import { getCurrentUserId } from "./offlineState";

// A copy of what the dashboard lists, so it still renders normally when the
// server can't be reached. Refreshed in the background while online.

export type DashboardSnapshot = {
  savedAt: number;
  owned: DrawingSummary[];
  shared: DrawingSummary[];
  /** Drawings inside collections other people shared with this user. */
  inSharedCollections: DrawingSummary[];
  collections: Collection[];
};

const PAGE_SIZE = 200;
const MAX_PAGES = 25;
const snapshotKey = () => `dashboard-snapshot:${getCurrentUserId()}`;

const fetchAll = async (
  fetchPage: (offset: number) => Promise<PaginatedDrawings<DrawingSummary>>,
) => {
  const all: DrawingSummary[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await fetchPage(all.length);
    all.push(...result.drawings);
    if (result.drawings.length === 0 || all.length >= result.totalCount) break;
  }
  return all;
};

export const refreshDashboardSnapshot = async (): Promise<void> => {
  const options = { limit: PAGE_SIZE, sortField: "updatedAt" as const };
  const [owned, shared, collections] = await Promise.all([
    fetchAll((offset) => api.getDrawings(undefined, undefined, { ...options, offset })),
    fetchAll((offset) => api.getSharedDrawings(undefined, { ...options, offset })),
    api.getCollections(),
  ]);
  const inSharedCollections: DrawingSummary[] = [];
  for (const collection of collections.filter((c) => c.isOwner === false)) {
    inSharedCollections.push(
      ...(await fetchAll((offset) =>
        api.getDrawings(undefined, collection.id, { ...options, offset }),
      )),
    );
  }
  await idbPut(
    "kv",
    {
      savedAt: Date.now(),
      owned,
      shared,
      inSharedCollections,
      collections,
    } satisfies DashboardSnapshot,
    snapshotKey(),
  );
};

export const getSnapshotAge = async (): Promise<number> => {
  const snapshot = await idbGet<DashboardSnapshot>("kv", snapshotKey());
  return snapshot ? Date.now() - snapshot.savedAt : Infinity;
};

type SnapshotQuery = {
  search: string;
  /** undefined = root, "shared" = shared with me, otherwise a collection id. */
  selectedCollectionId: string | null | undefined;
  sortField: DrawingSortField;
  sortDirection: SortDirection;
};

/** The dashboard's lists, answered from the snapshot and the offline copies. */
export const listFromSnapshot = async (query: SnapshotQuery) => {
  const snapshot = await idbGet<DashboardSnapshot>("kv", snapshotKey());
  const records = await getLocalRecords();
  // Offline copies are newer than the snapshot (renamed, edited offline).
  const localById = new Map(records.map((r) => [r.id, r.drawing]));
  const owned = (snapshot?.owned ?? []).map((d) => {
    const local = localById.get(d.id);
    return local ? { ...d, name: local.name, updatedAt: local.updatedAt } : d;
  });
  const ownedIds = new Set(owned.map((d) => d.id));
  const { selectedCollectionId: selected } = query;
  let drawings: DrawingSummary[];
  if (selected === "shared") drawings = snapshot?.shared ?? [];
  else if (selected === "trash") drawings = [];
  else {
    const collectionId = selected ?? null;
    const others = (snapshot?.inSharedCollections ?? []).filter(
      (d) => !ownedIds.has(d.id),
    );
    drawings = [...owned, ...others].filter(
      (d) => (d.collectionId ?? null) === collectionId,
    );
  }
  const search = query.search.trim().toLowerCase();
  if (search) drawings = drawings.filter((d) => d.name.toLowerCase().includes(search));
  const direction = query.sortDirection === "asc" ? 1 : -1;
  drawings = [...drawings].sort((a, b) =>
    query.sortField === "name"
      ? a.name.localeCompare(b.name) * direction
      : (a[query.sortField] - b[query.sortField]) * direction,
  );
  return { drawings, collections: snapshot?.collections ?? null };
};
