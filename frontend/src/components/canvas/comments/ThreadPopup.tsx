import React, { useState } from "react";
import { Check, Trash2, X } from "lucide-react";
import clsx from "clsx";

import type { CommentThread, UserSummary } from "../../../types";
import { MentionTextarea } from "./MentionTextarea";
import { splitCommentMentions } from "./mentionHighlight";

type ThreadPopupProps = {
  drawingId: string;
  thread: CommentThread;
  canPost: boolean;
  canDelete: boolean;
  onClose: () => void;
  onReply: (content: string, mentions: string[]) => Promise<unknown>;
  onToggleResolved: (resolved: boolean) => Promise<unknown>;
  onDelete: () => Promise<unknown>;
};

const formatWhen = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
};

/** Renders a comment with its @mentions picked out. */
const renderContent = (content: string, mentioned: UserSummary[]) =>
  splitCommentMentions(content, mentioned).map((segment, index) =>
    segment.isMention ? (
      <span
        key={index}
        className="font-bold text-indigo-600 dark:text-indigo-400"
      >
        {segment.text}
      </span>
    ) : (
      <React.Fragment key={index}>{segment.text}</React.Fragment>
    ),
  );

export const ThreadPopup: React.FC<ThreadPopupProps> = ({
  drawingId,
  thread,
  canPost,
  canDelete,
  onClose,
  onReply,
  onToggleResolved,
  onDelete,
}) => {
  const [draft, setDraft] = useState("");
  const [mentions, setMentions] = useState<UserSummary[]>([]);
  const [isBusy, setIsBusy] = useState(false);

  const submit = async () => {
    const content = draft.trim();
    if (!content || isBusy) return;
    setIsBusy(true);
    try {
      await onReply(
        content,
        mentions.map((user) => user.id),
      );
      setDraft("");
      setMentions([]);
    } catch (err) {
      console.error("Failed to post comment:", err);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="w-[300px] rounded-xl border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b-2 border-black dark:border-neutral-700 px-3 py-2">
        <span
          className={clsx(
            "text-[11px] font-black uppercase tracking-wider",
            thread.resolved
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-slate-400 dark:text-neutral-500",
          )}
        >
          {thread.resolved ? "Resolved" : `${thread.commentCount} comment${thread.commentCount === 1 ? "" : "s"}`}
        </span>
        <div className="flex items-center gap-1">
          {canPost && (
            <button
              type="button"
              title={thread.resolved ? "Reopen thread" : "Resolve thread"}
              aria-label={thread.resolved ? "Reopen thread" : "Resolve thread"}
              onClick={() => void onToggleResolved(!thread.resolved)}
              className="p-1.5 rounded-md text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
            >
              <Check size={15} strokeWidth={2.5} />
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              title="Delete thread"
              aria-label="Delete thread"
              onClick={() => void onDelete()}
              className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30"
            >
              <Trash2 size={15} strokeWidth={2.5} />
            </button>
          )}
          <button
            type="button"
            title="Close"
            aria-label="Close thread"
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X size={15} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      <ul className="max-h-64 overflow-y-auto px-3 py-2 space-y-3">
        {thread.comments.map((comment) => (
          <li key={comment.id}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {comment.createdBy.name}
              </span>
              <span className="text-[10px] text-slate-400 dark:text-neutral-500 shrink-0">
                {formatWhen(comment.createdAt)}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-slate-700 dark:text-neutral-300 whitespace-pre-wrap break-words">
              {renderContent(comment.content, comment.mentionedUsers ?? [])}
            </p>
          </li>
        ))}
      </ul>

      {canPost && (
        <div className="border-t-2 border-black dark:border-neutral-700 p-2">
          <MentionTextarea
            drawingId={drawingId}
            value={draft}
            onChange={setDraft}
            onMentionsChange={setMentions}
            onSubmit={() => void submit()}
            placeholder="Reply, @ to mention..."
          />
          <div className="mt-1 flex items-center justify-between">
            <span className="text-[10px] text-slate-400 dark:text-neutral-500">
              Enter to send
            </span>
            <button
              type="button"
              disabled={!draft.trim() || isBusy}
              onClick={() => void submit()}
              className="px-3 py-1 rounded-lg border-2 border-black dark:border-neutral-700 bg-indigo-600 text-white text-xs font-bold disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
