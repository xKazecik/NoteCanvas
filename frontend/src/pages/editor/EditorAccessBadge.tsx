import React from "react";
import { CloudOff } from "lucide-react";
import { useOffline } from "../../context/OfflineContext";

/** Header pills for read-only access and offline mode. */
export const EditorAccessBadge: React.FC<{
  id: string | undefined;
  canEdit: boolean;
  ownerOffline: boolean;
}> = ({ id, canEdit, ownerOffline }) => {
  const { isOnline, isStoredOffline } = useOffline();
  if (!canEdit) {
    return (
      <span
        className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200 border border-amber-200 dark:border-amber-800"
        title={
          ownerOffline
            ? "You can view this board but not edit it until the owner is back online."
            : undefined
        }
      >
        {ownerOffline ? "Read-only · Owner turned on offline mode" : "Read-only"}
      </span>
    );
  }
  if (!id || !isStoredOffline(id)) return null;
  return (
    <span
      className="flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-700 dark:bg-neutral-800 dark:text-neutral-200 border border-slate-200 dark:border-neutral-700"
      title="Changes are saved in this browser and synced to the server whenever you're connected."
      role="status"
    >
      <CloudOff size={14} />
      {isOnline ? "Offline mode · syncing" : "Offline mode · saved locally"}
    </span>
  );
};
