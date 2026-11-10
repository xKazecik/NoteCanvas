import * as api from "../api";
import type { Drawing } from "../types";
import { reconcileElements } from "../utils/sync";
import { rehydrateFilesFromUrls } from "../utils/rehydrateFiles";
import {
  deleteLocalDrawing,
  getLocalRecord,
  markLocalDrawingPushed,
  storeLocalDrawing,
} from "./localDrawings";
import type { LocalDrawingRecord } from "./localDrawings";
import { getStoredOfflineIds, setStoredOffline } from "./offlineState";

/**
 * Push one offline drawing's pending edits to the server. The server copy is
 * merged element-by-element (newer element versions win) rather than
 * overwritten, so edits made elsewhere survive. Throws when the server can't
 * be reached; the caller retries later.
 */
export const pushLocalChanges = async (id: string): Promise<void> => {
  const record = await getLocalRecord(id);
  if (record?.pendingCreate) return pushLocalCreate(record);
  if (!record || record.pending.length === 0) return;
  const pending = new Set(record.pending);
  const local = record.drawing;
  const remote = await api.fetchRemoteDrawing(id);
  const payload: Partial<Drawing> = {};

  if (pending.has("scene") || pending.has("files")) {
    payload.elements = reconcileElements(
      local.elements ?? [],
      Array.isArray(remote.elements) ? remote.elements : [],
    );
    payload.appState = local.appState;
    payload.version = remote.version;
    // Only images the server doesn't have yet: on a poor connection we don't
    // want to resend every inline image. The server unions the file map.
    const remoteFiles = remote.files ?? {};
    const newFiles = Object.fromEntries(
      Object.entries(local.files ?? {}).filter(([fileId]) => !remoteFiles[fileId]),
    );
    if (Object.keys(newFiles).length > 0) payload.files = newFiles;
  }
  if (pending.has("name")) payload.name = local.name;
  if (pending.has("preview")) payload.preview = local.preview;

  const updated = await api.putRemoteDrawing(id, payload);
  await markLocalDrawingPushed(id, record.rev, {
    elements: payload.elements,
    version: updated.version,
  });
};

/**
 * Create on the server a drawing that was made offline, under the id it has
 * had here all along, then flag it offline there like every other copy this
 * browser keeps. Edits that land while this is in flight stay pending and go
 * out with the next push as ordinary updates.
 */
const pushLocalCreate = async (record: LocalDrawingRecord): Promise<void> => {
  const { drawing } = record;
  const create = (collectionId: string | null) =>
    api.createRemoteDrawing({
      id: drawing.id,
      name: drawing.name,
      collectionId,
      elements: drawing.elements ?? [],
      appState: drawing.appState ?? {},
      files: drawing.files ?? {},
      preview: drawing.preview ?? null,
    });

  let created: Drawing;
  try {
    created = await create(drawing.collectionId ?? null);
  } catch (err) {
    // The collection it was made in was deleted or unshared in the meantime;
    // the drawing matters more than where it was filed.
    const status = api.isAxiosError(err) ? err.response?.status : undefined;
    if (!drawing.collectionId || (status !== 403 && status !== 404)) throw err;
    created = await create(null);
  }
  await api.setDrawingOffline(drawing.id, true);
  await markLocalDrawingPushed(drawing.id, record.rev, {
    version: created.version,
  });
};

let syncRun: Promise<{ failed: number }> | null = null;

/** Push every offline drawing that has pending edits; one run at a time. */
export const syncAllLocalChanges = (): Promise<{ failed: number }> => {
  if (!syncRun) {
    syncRun = (async () => {
      let failed = 0;
      for (const id of getStoredOfflineIds()) {
        try {
          await pushLocalChanges(id);
        } catch (err) {
          failed += 1;
          // Gone from the server (deleted elsewhere): drop the stale copy.
          // Never one that has yet to be created there: this browser holds
          // the only copy of it.
          if (
            api.isAxiosError(err) &&
            err.response?.status === 404 &&
            !(await getLocalRecord(id))?.pendingCreate
          ) {
            await deleteLocalDrawing(id);
            setStoredOffline(id, false);
          }
        }
      }
      return { failed };
    })().finally(() => {
      syncRun = null;
    });
  }
  return syncRun;
};

/** Flag the drawing offline on the server and keep a full copy here. */
export const takeDrawingOffline = async (id: string): Promise<void> => {
  await api.setDrawingOffline(id, true);
  try {
    const remote = await api.fetchRemoteDrawing(id);
    // Images are usually stored as /api/files refs; inline them so the copy
    // renders without a server.
    const files = await rehydrateFilesFromUrls(remote.files ?? {});
    await storeLocalDrawing({ ...remote, files, accessLevel: "owner" });
    setStoredOffline(id, true);
  } catch (err) {
    await api.setDrawingOffline(id, false).catch(() => undefined);
    throw err;
  }
};

/** Push the last edits, then hand the drawing back to the server. */
export const bringDrawingOnline = async (id: string): Promise<void> => {
  await pushLocalChanges(id);
  // From here new saves go straight to the server; push once more for any
  // edit that landed in the copy while the first push was in flight.
  setStoredOffline(id, false);
  try {
    await pushLocalChanges(id);
    await api.setDrawingOffline(id, false);
  } catch (err) {
    setStoredOffline(id, true);
    throw err;
  }
  await deleteLocalDrawing(id);
};
