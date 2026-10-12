import { isAxiosError } from "axios";

// Synchronous offline-mode state shared by the API layer and the UI:
//   - which drawings this browser keeps an offline copy of (per user),
//   - whether the global offline switch is on,
//   - whether the server is reachable right now.
// Kept in localStorage (small) so it is readable before IndexedDB opens.

const IDS_KEY = "notecanvas-offline-drawings";
const GLOBAL_KEY = "notecanvas-offline-mode";
const USER_KEY = "excalidash-user";

type OfflineIds = Record<string, string>; // drawingId -> owner userId

const readJson = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

/** The signed-in user as cached by AuthContext ("" when auth is disabled). */
export const getCurrentUserId = (): string => {
  const user = readJson<{ id?: unknown } | null>(USER_KEY, null);
  return typeof user?.id === "string" ? user.id : "";
};

let offlineIds: OfflineIds = readJson<OfflineIds>(IDS_KEY, {});
let globalOffline = readJson<Record<string, boolean>>(GLOBAL_KEY, {});
let serverReachable = true;
let version = 0;
const listeners = new Set<() => void>();
const localChangeListeners = new Set<() => void>();

const emit = () => {
  version += 1;
  listeners.forEach((listener) => listener());
};

export const subscribeOffline = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Changes whenever any offline state changes; for useSyncExternalStore. */
export const getOfflineStateVersion = () => version;

export const isStoredOffline = (drawingId: string | null | undefined) =>
  !!drawingId && offlineIds[drawingId] === getCurrentUserId();

export const getStoredOfflineIds = (): string[] => {
  const userId = getCurrentUserId();
  return Object.keys(offlineIds).filter((id) => offlineIds[id] === userId);
};

export const setStoredOffline = (drawingId: string, stored: boolean) => {
  const next = { ...offlineIds };
  if (stored) next[drawingId] = getCurrentUserId();
  else delete next[drawingId];
  offlineIds = next;
  localStorage.setItem(IDS_KEY, JSON.stringify(next));
  emit();
};

export const isGlobalOffline = () => !!globalOffline[getCurrentUserId()];

export const setGlobalOffline = (on: boolean) => {
  globalOffline = { ...globalOffline, [getCurrentUserId()]: on };
  localStorage.setItem(GLOBAL_KEY, JSON.stringify(globalOffline));
  emit();
};

export const isOnline = () =>
  serverReachable && (typeof navigator === "undefined" || navigator.onLine);

export const markServerReachable = (reachable: boolean) => {
  if (reachable === serverReachable) return;
  serverReachable = reachable;
  emit();
};

/**
 * A request that never reached the app server: no connection at all, or the
 * reverse proxy in front of it answered that the server is unreachable.
 */
export const isNetworkError = (err: unknown) => {
  if (!isAxiosError(err) || err.code === "ERR_CANCELED") return false;
  const status = err.response?.status;
  return status === undefined || status === 502 || status === 503 || status === 504;
};

/** Fired after every local edit to an offline drawing, to schedule a sync. */
export const onLocalChange = (listener: () => void) => {
  localChangeListeners.add(listener);
  return () => {
    localChangeListeners.delete(listener);
  };
};

export const notifyLocalChange = () => {
  localChangeListeners.forEach((listener) => listener());
};

if (typeof window !== "undefined") {
  window.addEventListener("online", emit);
  window.addEventListener("offline", emit);
}
