import React, { useState } from "react";
import { Cloud, CloudOff, Loader2 } from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";
import { getOfflineCandidates, type OfflineCandidate } from "../../api";
import { useOffline } from "../../context/OfflineContext";
import { ConfirmModal } from "../ConfirmModal";

/**
 * The global offline switch. Turning it on keeps every unshared board in this
 * browser; shared boards are only included if the owner ticks them, because
 * everyone else becomes read-only on them until offline mode is turned off.
 */
export const OfflineModeToggle: React.FC<{ className: string }> = ({ className }) => {
  const { isOnline, globalOffline, busy, enableGlobalOffline, disableGlobalOffline } =
    useOffline();
  const [sharedBoards, setSharedBoards] = useState<OfflineCandidate[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (globalOffline) {
      if (!isOnline) {
        toast.info("Connect to the internet to sync and turn offline mode off.");
        return;
      }
      await disableGlobalOffline();
      return;
    }
    setLoading(true);
    try {
      const shared = (await getOfflineCandidates()).filter((c) => c.isShared);
      if (shared.length === 0) {
        await enableGlobalOffline([]);
        return;
      }
      setSelected(new Set());
      setSharedBoards(shared);
    } catch {
      toast.error("Connect to the internet to turn on offline mode.");
    } finally {
      setLoading(false);
    }
  };

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const working = busy || loading;
  return (
    <>
      <button
        onClick={() => void handleClick()}
        disabled={working}
        aria-pressed={globalOffline}
        className={clsx(className, working && "opacity-70 cursor-wait")}
      >
        {working ? (
          <Loader2 size={18} className="animate-spin" />
        ) : globalOffline ? (
          <CloudOff size={18} />
        ) : (
          <Cloud size={18} />
        )}
        <span className="min-w-0 flex-1 text-left">
          {globalOffline ? "Offline mode: on" : "Offline mode: off"}
        </span>
        <span
          title={isOnline ? "Connected" : "No connection"}
          className={clsx(
            "w-2 h-2 rounded-full shrink-0",
            isOnline ? "bg-emerald-500" : "bg-rose-500",
          )}
        />
      </button>

      <ConfirmModal
        isOpen={sharedBoards !== null}
        title="Turn on offline mode"
        confirmText="Go offline"
        isDangerous={false}
        onCancel={() => setSharedBoards(null)}
        onConfirm={() => {
          const ids = [...selected];
          setSharedBoards(null);
          void enableGlobalOffline(ids);
        }}
        message={
          <div className="text-left space-y-3">
            <p>
              All your unshared boards will be saved in this browser. These boards
              are shared with other people. Tick the ones to take offline too:
              others can still view them but can't edit until you turn offline
              mode off. Their access is restored exactly as it was.
            </p>
            <ul className="max-h-48 overflow-y-auto space-y-1">
              {(sharedBoards ?? []).map((board) => (
                <li key={board.id}>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-neutral-200">
                    <input
                      type="checkbox"
                      checked={selected.has(board.id)}
                      onChange={() => toggleSelected(board.id)}
                    />
                    <span className="truncate">{board.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        }
      />
    </>
  );
};
