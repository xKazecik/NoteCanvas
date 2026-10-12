import type { Drawing } from "../types";
import { idbDelete, idbGet, idbGetAll, idbPut } from "./offlineDb";
import {
  getCurrentUserId,
  isStoredOffline,
  notifyLocalChange,
} from "./offlineState";

/** Parts of a drawing edited locally and not yet pushed to the server. */
export type PendingField = "scene" | "files" | "name" | "preview";

export type LocalDrawingRecord = {
  id: string;
  userId: string;
  /** Images are inlined as data: URLs so the copy works without a server. */
  drawing: Drawing;
  pending: PendingField[];
  /** Bumped on every local edit, so a sync can tell if it raced one. */
  rev: number;
  syncedAt: number | null;
};

// Every read-modify-write goes through this queue: an autosave and a preview
// save landing together must not drop each other's pending fields.
let queue: Promise<unknown> = Promise.resolve();
const serialize = <T>(task: () => Promise<T>): Promise<T> => {
  const next = queue.then(task, task);
  queue = next.catch(() => undefined);
  return next;
};

export const getLocalRecord = async (id: string) => {
  const record = await idbGet<LocalDrawingRecord>("drawings", id);
  return record && record.userId === getCurrentUserId() ? record : undefined;
};

export const getLocalRecords = async () => {
  const userId = getCurrentUserId();
  const records = await idbGetAll<LocalDrawingRecord>("drawings");
  return records.filter((record) => record.userId === userId);
};

export const storeLocalDrawing = (drawing: Drawing) =>
  serialize(() =>
    idbPut("drawings", {
      id: drawing.id,
      userId: getCurrentUserId(),
      drawing,
      pending: [],
      rev: 0,
      syncedAt: Date.now(),
    } satisfies LocalDrawingRecord),
  );

export const deleteLocalDrawing = (id: string) =>
  serialize(() => idbDelete("drawings", id));

/** The offline copy, when this browser keeps one for the current user. */
export const getLocalDrawing = async (id: string): Promise<Drawing | null> => {
  if (!isStoredOffline(id)) return null;
  const record = await getLocalRecord(id);
  return record ? { ...record.drawing, accessLevel: "owner" } : null;
};

/** Apply an edit to the offline copy; the sync engine pushes it later. */
export const updateLocalDrawing = (id: string, data: Partial<Drawing>) =>
  serialize(async (): Promise<Drawing> => {
    const record = await getLocalRecord(id);
    if (!record) throw new Error("The offline copy of this drawing is missing");
    const drawing: Drawing = { ...record.drawing, updatedAt: Date.now() };
    const pending = new Set(record.pending);
    if (data.elements !== undefined || data.appState !== undefined) {
      if (data.elements !== undefined) drawing.elements = data.elements;
      if (data.appState !== undefined) drawing.appState = data.appState;
      pending.add("scene");
    }
    if (data.files !== undefined) {
      drawing.files = data.files;
      pending.add("files");
    }
    if (data.name !== undefined) {
      drawing.name = data.name;
      pending.add("name");
    }
    if (data.preview !== undefined) {
      drawing.preview = data.preview;
      pending.add("preview");
    }
    await idbPut("drawings", {
      ...record,
      drawing,
      pending: [...pending],
      rev: record.rev + 1,
    } satisfies LocalDrawingRecord);
    notifyLocalChange();
    return { ...drawing, accessLevel: "owner" };
  });

/**
 * Record a successful push. When no edit landed while it was in flight the
 * copy is clean again and takes the merged elements; otherwise the newer edits
 * stay pending and the next push merges them.
 */
export const markLocalDrawingPushed = (
  id: string,
  pushedRev: number,
  merged: { elements?: any[]; version: number },
) =>
  serialize(async () => {
    const record = await getLocalRecord(id);
    if (!record) return;
    const clean = record.rev === pushedRev;
    await idbPut("drawings", {
      ...record,
      drawing: {
        ...record.drawing,
        version: merged.version,
        ...(clean && merged.elements ? { elements: merged.elements } : {}),
      },
      pending: clean ? [] : record.pending,
      syncedAt: Date.now(),
    } satisfies LocalDrawingRecord);
  });
