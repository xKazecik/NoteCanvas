import React, { useState } from "react";
import { MessageSquare } from "lucide-react";
import clsx from "clsx";

import type { CommentThread } from "../../../types";

type CommentsPanelProps = {
  threads: CommentThread[];
  isLoading: boolean;
  error: string | null;
  canPost: boolean;
  selectedThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onStartPlacing: () => void;
};

const formatWhen = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString();
};

export const CommentsPanel: React.FC<CommentsPanelProps> = ({
  threads,
  isLoading,
  error,
  canPost,
  selectedThreadId,
  onSelectThread,
  onStartPlacing,
}) => {
  const [showResolved, setShowResolved] = useState(false);

  const visible = showResolved
    ? threads
    : threads.filter((thread) => !thread.resolved);
  const resolvedCount = threads.filter((thread) => thread.resolved).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <span className="text-sm font-bold text-slate-900 dark:text-white">
          Comments
        </span>
        {canPost && (
          <button
            type="button"
            onClick={onStartPlacing}
            className="px-2.5 py-1 rounded-lg border-2 border-black dark:border-neutral-700 bg-indigo-600 text-white text-xs font-bold"
          >
            + Add
          </button>
        )}
      </div>

      {resolvedCount > 0 && (
        <label className="flex items-center gap-2 px-4 pb-2 text-xs font-semibold text-slate-500 dark:text-neutral-400">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(event) => setShowResolved(event.target.checked)}
          />
          Show resolved ({resolvedCount})
        </label>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {error && (
          <p className="px-1 py-2 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}

        {!error && isLoading && threads.length === 0 && (
          <p className="px-1 py-2 text-sm text-slate-400 dark:text-neutral-500">
            Loading comments...
          </p>
        )}

        {!error && !isLoading && visible.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <MessageSquare
              size={26}
              className="text-slate-300 dark:text-neutral-600"
            />
            <p className="text-sm font-semibold text-slate-500 dark:text-neutral-400">
              {threads.length === 0
                ? "No comments yet"
                : "No open comments"}
            </p>
            {canPost && threads.length === 0 && (
              <p className="text-xs text-slate-400 dark:text-neutral-500">
                Add one to pin a note to a spot on the canvas.
              </p>
            )}
          </div>
        )}

        <ul className="space-y-2">
          {visible.map((thread) => {
            const first = thread.comments[0];
            return (
              <li key={thread.id}>
                <button
                  type="button"
                  onClick={() => onSelectThread(thread.id)}
                  className={clsx(
                    "w-full rounded-lg border-2 px-3 py-2 text-left transition-colors",
                    thread.id === selectedThreadId
                      ? "border-indigo-500 bg-indigo-50 dark:bg-neutral-800"
                      : "border-slate-200 dark:border-neutral-700 hover:bg-slate-50 dark:hover:bg-neutral-800",
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {thread.createdBy.name}
                    </span>
                    <span className="shrink-0 text-[10px] text-slate-400 dark:text-neutral-500">
                      {formatWhen(thread.createdAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-sm text-slate-600 dark:text-neutral-300">
                    {first?.content ?? ""}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    {thread.resolved && (
                      <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-600 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400">
                        Resolved
                      </span>
                    )}
                    {thread.commentCount > 1 && (
                      <span className="text-[10px] font-bold text-slate-400 dark:text-neutral-500">
                        {thread.commentCount} comments
                      </span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};
