import React, { useEffect, useState } from "react";
import {
  sceneCoordsToViewportCoords,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import type {
  AppState,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import { MessageSquare } from "lucide-react";
import clsx from "clsx";

import type { CommentThread, UserSummary } from "../../../types";
import { MentionTextarea } from "./MentionTextarea";
import { ThreadPopup } from "./ThreadPopup";

/**
 * The parts of appState that decide where a scene point lands on screen. Taken
 * straight off AppState because zoom.value is a branded number.
 */
type Viewport = Pick<
  AppState,
  "scrollX" | "scrollY" | "zoom" | "offsetLeft" | "offsetTop"
>;

type CommentLayerProps = {
  drawingId: string;
  excalidrawAPI: ExcalidrawImperativeAPI;
  threads: CommentThread[];
  canPost: boolean;
  currentUserId: string | undefined;
  isDrawingOwner: boolean;
  /** True while the user is placing a new comment. */
  isPlacing: boolean;
  onPlacingChange: (placing: boolean) => void;
  selectedThreadId: string | null;
  onSelectThread: (threadId: string | null) => void;
  onCreateThread: (input: {
    x: number;
    y: number;
    content: string;
    mentions?: string[];
  }) => Promise<unknown>;
  onReply: (
    threadId: string,
    content: string,
    mentions: string[],
  ) => Promise<unknown>;
  onToggleResolved: (threadId: string, resolved: boolean) => Promise<unknown>;
  onDelete: (threadId: string) => Promise<unknown>;
};

/**
 * Draws the comment markers over the canvas and hosts the thread popup.
 *
 * Markers are stored in scene coordinates, so they have to be re-projected
 * whenever the canvas is panned or zoomed; the editor's onChange gives us that.
 */
export const CommentLayer: React.FC<CommentLayerProps> = ({
  drawingId,
  excalidrawAPI,
  threads,
  canPost,
  currentUserId,
  isDrawingOwner,
  isPlacing,
  onPlacingChange,
  selectedThreadId,
  onSelectThread,
  onCreateThread,
  onReply,
  onToggleResolved,
  onDelete,
}) => {
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [pending, setPending] = useState<{
    sceneX: number;
    sceneY: number;
  } | null>(null);
  const [draft, setDraft] = useState("");
  const [mentions, setMentions] = useState<UserSummary[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const readViewport = () => {
      const state = excalidrawAPI.getAppState();
      setViewport({
        scrollX: state.scrollX,
        scrollY: state.scrollY,
        zoom: state.zoom,
        offsetLeft: state.offsetLeft,
        offsetTop: state.offsetTop,
      });
    };
    readViewport();
    return excalidrawAPI.onChange(readViewport);
  }, [excalidrawAPI]);

  if (!viewport) return null;

  const toViewport = (sceneX: number, sceneY: number) =>
    sceneCoordsToViewportCoords({ sceneX, sceneY }, viewport);

  const cancelPending = () => {
    setPending(null);
    setDraft("");
    setMentions([]);
    onPlacingChange(false);
  };

  const submitPending = async () => {
    const content = draft.trim();
    if (!pending || !content || isSaving) return;
    setIsSaving(true);
    try {
      await onCreateThread({
        x: pending.sceneX,
        y: pending.sceneY,
        content,
        mentions: mentions.map((user) => user.id),
      });
      cancelPending();
    } catch (err) {
      console.error("Failed to create comment thread:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const selectedThread =
    threads.find((thread) => thread.id === selectedThreadId) ?? null;

  return (
    <>
      {/* Catches the click that places a new comment. */}
      {isPlacing && !pending && (
        <div
          role="presentation"
          onClick={(event) => {
            const scene = viewportCoordsToSceneCoords(
              { clientX: event.clientX, clientY: event.clientY },
              viewport,
            );
            setPending({ sceneX: scene.x, sceneY: scene.y });
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") onPlacingChange(false);
          }}
          className="fixed inset-0 z-[120] cursor-crosshair"
        />
      )}

      <div className="pointer-events-none fixed inset-0 z-[121]">
        {threads.map((thread) => {
          const { x, y } = toViewport(thread.x, thread.y);
          const isSelected = thread.id === selectedThreadId;
          return (
            <button
              key={thread.id}
              type="button"
              title={`${thread.createdBy.name}: ${thread.comments[0]?.content ?? ""}`}
              aria-label={`Comment thread by ${thread.createdBy.name}`}
              onClick={() => onSelectThread(isSelected ? null : thread.id)}
              style={{ left: x, top: y }}
              className={clsx(
                "pointer-events-auto absolute -translate-x-1/2 -translate-y-full flex h-8 w-8 items-center justify-center rounded-full rounded-bl-none border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-transform hover:scale-110",
                thread.resolved
                  ? "bg-emerald-400 text-emerald-950"
                  : "bg-amber-300 text-amber-950",
                isSelected && "scale-110 ring-2 ring-indigo-500",
              )}
            >
              <MessageSquare size={15} strokeWidth={2.5} />
            </button>
          );
        })}

        {selectedThread && (
          <div
            style={{
              left: toViewport(selectedThread.x, selectedThread.y).x + 16,
              top: toViewport(selectedThread.x, selectedThread.y).y,
            }}
            className="pointer-events-auto absolute"
          >
            <ThreadPopup
              drawingId={drawingId}
              thread={selectedThread}
              canPost={canPost}
              canDelete={
                isDrawingOwner || selectedThread.createdBy.id === currentUserId
              }
              onClose={() => onSelectThread(null)}
              onReply={(content, mentionIds) =>
                onReply(selectedThread.id, content, mentionIds)
              }
              onToggleResolved={(resolved) =>
                onToggleResolved(selectedThread.id, resolved)
              }
              onDelete={async () => {
                await onDelete(selectedThread.id);
                onSelectThread(null);
              }}
            />
          </div>
        )}

        {pending && (
          <div
            style={{
              left: toViewport(pending.sceneX, pending.sceneY).x + 16,
              top: toViewport(pending.sceneX, pending.sceneY).y,
            }}
            className="pointer-events-auto absolute w-[300px] rounded-xl border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)]"
          >
            <MentionTextarea
              drawingId={drawingId}
              value={draft}
              onChange={setDraft}
              onMentionsChange={setMentions}
              onSubmit={() => void submitPending()}
              placeholder="Add a comment, @ to mention..."
              autoFocus
            />
            <div className="mt-1 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={cancelPending}
                className="px-3 py-1 rounded-lg border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-900 dark:text-white text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!draft.trim() || isSaving}
                onClick={() => void submitPending()}
                className="px-3 py-1 rounded-lg border-2 border-black dark:border-neutral-700 bg-indigo-600 text-white text-xs font-bold disabled:opacity-40"
              >
                Comment
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};
