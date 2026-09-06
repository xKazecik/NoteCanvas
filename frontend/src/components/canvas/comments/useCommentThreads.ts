import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

import * as api from "../../../api";
import type { CommentThread } from "../../../types";

type UseCommentThreadsParams = {
  drawingId: string | undefined;
  /** The editor's collaboration socket, so other people's changes arrive live. */
  socketRef?: React.MutableRefObject<Socket | null>;
  enabled: boolean;
};

const sortThreads = (threads: CommentThread[]) =>
  [...threads].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

/**
 * Holds the drawing's comment threads.
 *
 * Mutations return the updated thread, which is merged straight in rather than
 * refetching the list, and the same changes arrive over the collaboration
 * socket for everyone else in the room.
 */
export const useCommentThreads = ({
  drawingId,
  socketRef,
  enabled,
}: UseCommentThreadsParams) => {
  const [threads, setThreads] = useState<CommentThread[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keeps a stale response from a previous drawing out of the current one.
  const requestIdRef = useRef(0);

  const mergeThread = useCallback((thread: CommentThread) => {
    setThreads((current) => {
      const without = current.filter((entry) => entry.id !== thread.id);
      return sortThreads([...without, thread]);
    });
  }, []);

  const removeThread = useCallback((threadId: string) => {
    setThreads((current) => current.filter((entry) => entry.id !== threadId));
  }, []);

  const refresh = useCallback(async () => {
    if (!drawingId || !enabled) return;
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    try {
      const next = await api.listCommentThreads(drawingId);
      if (requestId === requestIdRef.current) {
        setThreads(sortThreads(next));
        setError(null);
      }
    } catch (err) {
      console.error("Failed to load comment threads:", err);
      if (requestId === requestIdRef.current) {
        setError("Could not load comments");
      }
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [drawingId, enabled]);

  useEffect(() => {
    if (!enabled) {
      setThreads([]);
      return;
    }
    void refresh();
  }, [refresh, enabled]);

  // Live updates from other people in the same drawing.
  useEffect(() => {
    const socket = socketRef?.current;
    if (!socket || !enabled) return;

    const onCreated = (payload: { thread: CommentThread }) => {
      if (payload?.thread) mergeThread(payload.thread);
    };
    const onUpdated = (payload: { thread: CommentThread }) => {
      if (payload?.thread) mergeThread(payload.thread);
    };
    const onDeleted = (payload: { threadId: string }) => {
      if (payload?.threadId) removeThread(payload.threadId);
    };

    socket.on("comment-thread-created", onCreated);
    socket.on("comment-thread-updated", onUpdated);
    socket.on("comment-thread-deleted", onDeleted);
    return () => {
      socket.off("comment-thread-created", onCreated);
      socket.off("comment-thread-updated", onUpdated);
      socket.off("comment-thread-deleted", onDeleted);
    };
    // socketRef is a ref, so this re-runs when the drawing (and its socket) changes.
  }, [socketRef, enabled, drawingId, mergeThread, removeThread]);

  const createThread = useCallback(
    async (input: {
      x: number;
      y: number;
      content: string;
      mentions?: string[];
    }) => {
      if (!drawingId) return null;
      const thread = await api.createCommentThread(drawingId, input);
      mergeThread(thread);
      return thread;
    },
    [drawingId, mergeThread],
  );

  const reply = useCallback(
    async (threadId: string, content: string, mentions?: string[]) => {
      const thread = await api.replyToCommentThread(threadId, {
        content,
        mentions,
      });
      mergeThread(thread);
      return thread;
    },
    [mergeThread],
  );

  const setResolved = useCallback(
    async (threadId: string, resolved: boolean) => {
      const thread = await api.setCommentThreadResolved(threadId, resolved);
      mergeThread(thread);
      return thread;
    },
    [mergeThread],
  );

  const remove = useCallback(
    async (threadId: string) => {
      await api.deleteCommentThread(threadId);
      removeThread(threadId);
    },
    [removeThread],
  );

  return {
    threads,
    isLoading,
    error,
    refresh,
    createThread,
    reply,
    setResolved,
    remove,
  };
};
