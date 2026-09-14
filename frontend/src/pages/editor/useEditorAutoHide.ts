import { useCallback, useEffect, useMemo, useState } from "react";

export const useEditorAutoHide = (drawingId: string | undefined) => {
  const storageKey = useMemo(
    () => (drawingId ? `excalidash:editor:${drawingId}:autoHideEnabled` : null),
    [drawingId],
  );

  // The toolbar stays put until someone asks for it to get out of the way, so
  // auto-hide is opt-in: an editor with no stored preference shows its header.
  const getStoredAutoHideEnabled = useCallback((): boolean => {
    if (!storageKey) return false;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw === null) return false;
      return raw === "1" || raw === "true";
    } catch {
      return false;
    }
  }, [storageKey]);

  const [autoHideEnabled, setAutoHideEnabled] = useState(
    getStoredAutoHideEnabled,
  );

  useEffect(() => {
    setAutoHideEnabled(getStoredAutoHideEnabled());
  }, [getStoredAutoHideEnabled]);

  const setAndStoreAutoHideEnabled = useCallback(
    (next: boolean) => {
      setAutoHideEnabled(next);
      if (storageKey) {
        try {
          window.localStorage.setItem(storageKey, next ? "1" : "0");
        } catch {
          // Ignore storage errors in restricted browser contexts.
        }
      }
    },
    [storageKey],
  );

  return {
    autoHideEnabled,
    setAutoHideEnabled: setAndStoreAutoHideEnabled,
  };
};
