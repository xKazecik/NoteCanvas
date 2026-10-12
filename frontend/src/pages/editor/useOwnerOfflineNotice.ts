import { useCallback, useEffect, useRef, useState } from "react";

type AccessLevel = "none" | "view" | "edit" | "owner";

/**
 * Tracks whether the owner has this drawing in offline mode, from the
 * collaboration socket's "drawing-offline-changed" event (sent on join and
 * whenever the owner toggles it). Others are read-only meanwhile, so a change
 * in either direction reloads the editor to pick up the new access level.
 */
export const useOwnerOfflineNotice = (
  drawingId: string | undefined,
  accessLevel: AccessLevel,
) => {
  const [ownerOffline, setOwnerOffline] = useState(false);
  const ownerOfflineRef = useRef(false);
  const accessLevelRef = useRef(accessLevel);
  useEffect(() => {
    ownerOfflineRef.current = ownerOffline;
    accessLevelRef.current = accessLevel;
  }, [ownerOffline, accessLevel]);

  const handleOfflineChanged = useCallback(
    (payload: { drawingId?: string; offlineAt?: string | null }) => {
      if (payload?.drawingId !== drawingId) return;
      if (accessLevelRef.current === "owner") return;
      if (payload.offlineAt) {
        if (accessLevelRef.current === "edit") window.location.reload();
        else setOwnerOffline(true);
      } else if (ownerOfflineRef.current) {
        window.location.reload();
      }
    },
    [drawingId],
  );

  return { ownerOffline, handleOfflineChanged };
};
