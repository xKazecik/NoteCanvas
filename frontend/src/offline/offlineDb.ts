// Minimal IndexedDB access for offline mode. Drawings (with their images
// inlined) are too large for localStorage, so they live here.
//   - "drawings": one LocalDrawingRecord per offline drawing, keyed by id.
//   - "kv": small documents such as the dashboard snapshot.

export type OfflineStoreName = "drawings" | "kv";

const DB_NAME = "notecanvas-offline";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

const openDb = (): Promise<IDBDatabase> => {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("drawings")) {
          db.createObjectStore("drawings", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        reject(request.error);
      };
    });
  }
  return dbPromise;
};

const run = async <T>(
  store: OfflineStoreName,
  mode: IDBTransactionMode,
  operation: (objectStore: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = operation(tx.objectStore(store));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
};

export const idbGet = <T>(store: OfflineStoreName, key: string) =>
  run<T | undefined>(store, "readonly", (s) => s.get(key));

export const idbGetAll = <T>(store: OfflineStoreName) =>
  run<T[]>(store, "readonly", (s) => s.getAll());

export const idbPut = (store: OfflineStoreName, value: unknown, key?: string) =>
  run(store, "readwrite", (s) => s.put(value, key));

export const idbDelete = (store: OfflineStoreName, key: string) =>
  run(store, "readwrite", (s) => s.delete(key));
