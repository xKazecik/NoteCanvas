import type { CommentThread, UserSummary } from "../types";
import { api } from "./client";

export const listCommentThreads = async (
  drawingId: string,
): Promise<CommentThread[]> => {
  const response = await api.get<{ threads: CommentThread[] }>(
    `/drawings/${drawingId}/comment-threads`,
  );
  return response.data.threads;
};

export const createCommentThread = async (
  drawingId: string,
  thread: { x: number; y: number; content: string; mentions?: string[] },
): Promise<CommentThread> => {
  const response = await api.post<{ thread: CommentThread }>(
    `/drawings/${drawingId}/comment-threads`,
    thread,
  );
  return response.data.thread;
};

export const replyToCommentThread = async (
  threadId: string,
  comment: { content: string; mentions?: string[] },
): Promise<CommentThread> => {
  const response = await api.post<{ thread: CommentThread }>(
    `/comment-threads/${threadId}/comments`,
    comment,
  );
  return response.data.thread;
};

export const setCommentThreadResolved = async (
  threadId: string,
  resolved: boolean,
): Promise<CommentThread> => {
  const response = await api.patch<{ thread: CommentThread }>(
    `/comment-threads/${threadId}`,
    { resolved },
  );
  return response.data.thread;
};

export const deleteCommentThread = async (
  threadId: string,
): Promise<{ success: true }> => {
  const response = await api.delete<{ success: true }>(
    `/comment-threads/${threadId}`,
  );
  return response.data;
};

/** The people an @mention on this drawing can reach. */
export const getMentionableUsers = async (
  drawingId: string,
  query?: string,
): Promise<UserSummary[]> => {
  const response = await api.get<{ users: UserSummary[] }>(
    `/drawings/${drawingId}/mentionable-users`,
    { params: query ? { q: query } : undefined },
  );
  return response.data.users;
};
