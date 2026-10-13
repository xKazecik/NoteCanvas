import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { api, getOfflineCandidates } from "../api";
import { useAuth } from "./AuthContext";
import {
  getConnectionTimeoutMs,
  getOfflineStateVersion,
  getStoredOfflineIds,
  isGlobalOffline,
  isOnline,
  isStoredOffline,
  onLocalChange,
  setGlobalOffline,
  subscribeOffline,
} from "../offline/offlineState";
import {
  bringDrawingOnline,
  syncAllLocalChanges,
  takeDrawingOffline,
} from "../offline/offlineSync";
import { getSnapshotAge, refreshDashboardSnapshot } from "../offline/offlineSnapshot";

const SYNC_INTERVAL_MS = 15_000;
const LOCAL_CHANGE_SYNC_DELAY_MS = 3_000;
const SNAPSHOT_MAX_AGE_MS = 10 * 60_000;

// The editor is a lazy chunk: fetch it while online so the service worker has
// it cached before the connection drops.
const warmEditorChunk = () => {
  void import("../pages/Editor").catch(() => undefined);
};

interface OfflineContextType {
  /** The server is reachable right now. */
  isOnline: boolean;
  /** The global "offline mode" switch is on. */
  globalOffline: boolean;
  /** A drawing or global switch change is in progress. */
  busy: boolean;
  isStoredOffline: (drawingId: string) => boolean;
  takeOffline: (drawingId: string) => Promise<void>;
  bringOnline: (drawingId: string) => Promise<void>;
  /** Takes every unshared drawing offline, plus the chosen shared ones. */
  enableGlobalOffline: (sharedIdsToInclude: string[]) => Promise<void>;
  disableGlobalOffline: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined);

const errorMessage = (err: unknown, fallback: string) => {
  const data = (err as { response?: { data?: { message?: unknown } } })?.response?.data;
  return typeof data?.message === "string" ? data.message : fallback;
};

export const OfflineProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, authEnabled } = useAuth();
  const signedIn = !!user || authEnabled === false;
  useSyncExternalStore(subscribeOffline, getOfflineStateVersion);
  const online = isOnline();
  const [busy, setBusy] = useState(false);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Push pending edits whenever we can; when there is nothing to push, a cheap
  // health check notices the connection coming back.
  const syncNow = useCallback(async () => {
    if (!signedIn || (typeof navigator !== "undefined" && !navigator.onLine)) return;
    if (getStoredOfflineIds().length > 0) {
      await syncAllLocalChanges();
    } else if (!isOnline()) {
      await api.get("/health", { timeout: getConnectionTimeoutMs() }).catch(() => undefined);
    }
    if (isOnline() && (await getSnapshotAge()) > SNAPSHOT_MAX_AGE_MS) {
      await refreshDashboardSnapshot().catch(() => undefined);
    }
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn) return;
    if (getStoredOfflineIds().length > 0) warmEditorChunk();
    void syncNow();
    const interval = setInterval(() => void syncNow(), SYNC_INTERVAL_MS);
    const handleOnline = () => void syncNow();
    window.addEventListener("online", handleOnline);
    const stopLocalChange = onLocalChange(() => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(() => void syncNow(), LOCAL_CHANGE_SYNC_DELAY_MS);
    });
    return () => {
      clearInterval(interval);
      window.removeEventListener("online", handleOnline);
      stopLocalChange();
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, [signedIn, syncNow]);

  const runBusy = useCallback(async (task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
    } finally {
      setBusy(false);
    }
  }, []);

  const takeOffline = useCallback(
    (drawingId: string) =>
      runBusy(async () => {
        try {
          await takeDrawingOffline(drawingId);
          warmEditorChunk();
          toast.success(
            "Board is available offline. Anyone it's shared with can view it but not edit until you bring it back online.",
          );
        } catch (err) {
          toast.error(errorMessage(err, "Couldn't take the board offline. Check your connection."));
        }
      }),
    [runBusy],
  );

  const bringOnline = useCallback(
    (drawingId: string) =>
      runBusy(async () => {
        try {
          await bringDrawingOnline(drawingId);
          toast.success("Board is back online");
        } catch (err) {
          toast.error(errorMessage(err, "Couldn't sync the board. It stays offline until you're connected."));
        }
      }),
    [runBusy],
  );

  const enableGlobalOffline = useCallback(
    (sharedIdsToInclude: string[]) =>
      runBusy(async () => {
        const include = new Set(sharedIdsToInclude);
        let failed = 0;
        try {
          const candidates = await getOfflineCandidates();
          const targets = candidates.filter(
            (c) => (!c.isShared || include.has(c.id)) && !isStoredOffline(c.id),
          );
          const progress = toast.loading(`Saving ${targets.length} boards for offline use…`);
          for (const target of targets) {
            await takeDrawingOffline(target.id).catch(() => {
              failed += 1;
            });
          }
          toast.dismiss(progress);
          await refreshDashboardSnapshot().catch(() => undefined);
        } catch (err) {
          toast.error(errorMessage(err, "Couldn't turn on offline mode. Check your connection."));
          return;
        }
        setGlobalOffline(true);
        warmEditorChunk();
        if (failed > 0) toast.warning(`${failed} boards couldn't be saved for offline use`);
        else toast.success("Offline mode is on. You can disconnect now.");
      }),
    [runBusy],
  );

  const disableGlobalOffline = useCallback(
    () =>
      runBusy(async () => {
        let failed = 0;
        for (const id of getStoredOfflineIds()) {
          await bringDrawingOnline(id).catch(() => {
            failed += 1;
          });
        }
        setGlobalOffline(false);
        if (failed > 0) {
          toast.warning(
            `${failed} boards couldn't be synced yet. They stay offline and sync when you're connected.`,
          );
        } else {
          toast.success("Offline mode is off. All boards are synced.");
        }
      }),
    [runBusy],
  );

  return (
    <OfflineContext.Provider
      value={{
        isOnline: online,
        globalOffline: isGlobalOffline(),
        busy,
        isStoredOffline,
        takeOffline,
        bringOnline,
        enableGlobalOffline,
        disableGlobalOffline,
      }}
    >
      {children}
    </OfflineContext.Provider>
  );
};

// Outside the provider (isolated component tests) behave as plain online mode.
const noop = async () => undefined;
const ONLINE_ONLY: OfflineContextType = {
  isOnline: true,
  globalOffline: false,
  busy: false,
  isStoredOffline: () => false,
  takeOffline: noop,
  bringOnline: noop,
  enableGlobalOffline: noop,
  disableGlobalOffline: noop,
};

export const useOffline = () => useContext(OfflineContext) ?? ONLINE_ONLY;
