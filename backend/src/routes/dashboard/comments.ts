import express from "express";
import {
  canEditDrawing,
  canViewDrawing,
  getDrawingAccess,
} from "../../authz/sharing";
import { DashboardRouteDeps } from "./types";

const MAX_COMMENT_LENGTH = 5000;
const MAX_MENTIONS = 50;

/**
 * Canvas comments.
 *
 * A thread is pinned to a point on a drawing and holds one or more comments.
 * There is no separate permission model: whoever may view the drawing may read
 * its threads, and whoever may edit it may post. Everything goes through
 * requireAuth, so anonymous link-share visitors cannot read or write comments
 * even when the link grants them edit access to the canvas itself.
 */
export const registerCommentRoutes = (
  app: express.Express,
  deps: DashboardRouteDeps,
) => {
  const { prisma, requireAuth, asyncHandler, sanitizeText, parseJsonField, io } =
    deps;

  const userSummarySelect = {
    id: true,
    name: true,
    email: true,
  } as const;

  const threadInclude = {
    createdBy: { select: userSummarySelect },
    resolvedBy: { select: userSummarySelect },
    comments: {
      orderBy: { createdAt: "asc" },
      include: { createdBy: { select: userSummarySelect } },
    },
  } as const;

  type RawThread = {
    comments: { mentions: string }[];
    [key: string]: unknown;
  };

  // Mentions are stored as a JSON string because sqlite has no array type.
  const serializeThread = (thread: RawThread) => ({
    ...thread,
    comments: thread.comments.map((comment) => ({
      ...comment,
      mentions: parseJsonField<string[]>(comment.mentions, []),
    })),
    commentCount: thread.comments.length,
  });

  /**
   * Same as serializeThread, plus the names behind each comment's mention ids.
   * The client needs them to highlight an @mention, and a name can contain
   * spaces, so it cannot recover them from the text alone.
   */
  const serializeThreadsWithMentionNames = async (threads: RawThread[]) => {
    const serialized = threads.map(serializeThread);

    const mentionIds = new Set<string>();
    for (const thread of serialized) {
      for (const comment of thread.comments) {
        for (const id of comment.mentions) mentionIds.add(id);
      }
    }
    if (mentionIds.size === 0) {
      // Still attach the field, so the shape does not change with the content.
      return serialized.map((thread) => ({
        ...thread,
        comments: thread.comments.map((comment) => ({
          ...comment,
          mentionedUsers: [] as { id: string; name: string; email: string }[],
        })),
      }));
    }

    const users = await prisma.user.findMany({
      where: { id: { in: [...mentionIds] } },
      select: userSummarySelect,
    });
    const byId = new Map(users.map((user) => [user.id, user]));

    return serialized.map((thread) => ({
      ...thread,
      comments: thread.comments.map((comment) => ({
        ...comment,
        mentionedUsers: comment.mentions
          .map((id) => byId.get(id))
          .filter((user): user is (typeof users)[number] => Boolean(user)),
      })),
    }));
  };

  const serializeOneThread = async (thread: RawThread) =>
    (await serializeThreadsWithMentionNames([thread]))[0];

  const readAccess = async (userId: string, drawingId: string) =>
    getDrawingAccess({
      prisma,
      principal: { kind: "user", userId },
      drawingId,
    });

  /**
   * Only ids that actually resolve to users with access to the drawing are
   * kept, so a hand-crafted request cannot record a mention of someone who
   * cannot see the thread.
   */
  const sanitizeMentions = async (
    rawMentions: unknown,
    drawingId: string,
  ): Promise<string[]> => {
    if (!Array.isArray(rawMentions)) return [];
    const ids = [
      ...new Set(
        rawMentions.filter((id): id is string => typeof id === "string"),
      ),
    ].slice(0, MAX_MENTIONS);
    if (ids.length === 0) return [];

    const allowed: string[] = [];
    for (const id of ids) {
      const access = await readAccess(id, drawingId);
      if (canViewDrawing(access)) allowed.push(id);
    }
    return allowed;
  };

  const parseContent = (rawContent: unknown): string | null => {
    if (typeof rawContent !== "string") return null;
    const content = sanitizeText(rawContent, MAX_COMMENT_LENGTH).trim();
    return content.length > 0 ? content : null;
  };

  /**
   * Pushes the change to everyone in the drawing's collaboration room. The room
   * name has to match the one server/socket.ts joins clients to.
   */
  const broadcast = (drawingId: string, event: string, payload: unknown) => {
    io?.to(`drawing_${drawingId}`).emit(event, payload);
  };

  // GET /drawings/:drawingId/comment-threads
  app.get(
    "/drawings/:drawingId/comment-threads",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const { drawingId } = req.params;

      const access = await readAccess(req.user.id, drawingId);
      if (!canViewDrawing(access)) {
        return res.status(404).json({ error: "Drawing not found" });
      }

      const threads = await prisma.commentThread.findMany({
        where: { drawingId },
        include: threadInclude,
        orderBy: { createdAt: "asc" },
      });

      return res.json({
        threads: await serializeThreadsWithMentionNames(threads),
      });
    }),
  );

  // POST /drawings/:drawingId/comment-threads — new thread with its first comment
  app.post(
    "/drawings/:drawingId/comment-threads",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const { drawingId } = req.params;

      const access = await readAccess(req.user.id, drawingId);
      if (!canViewDrawing(access)) {
        return res.status(404).json({ error: "Drawing not found" });
      }
      if (!canEditDrawing(access)) {
        return res.status(403).json({ error: "Viewers cannot post comments" });
      }

      const { x, y } = req.body ?? {};
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return res.status(400).json({
          error: "Validation error",
          message: "x and y must be numbers",
        });
      }

      const content = parseContent(req.body?.content);
      if (!content) {
        return res.status(400).json({
          error: "Validation error",
          message: `Comment must be between 1 and ${MAX_COMMENT_LENGTH} characters`,
        });
      }

      const mentions = await sanitizeMentions(req.body?.mentions, drawingId);

      const thread = await prisma.commentThread.create({
        data: {
          drawingId,
          x,
          y,
          createdById: req.user.id,
          comments: {
            create: {
              content,
              mentions: JSON.stringify(mentions),
              createdById: req.user.id,
            },
          },
        },
        include: threadInclude,
      });

      const payload = await serializeOneThread(thread);
      broadcast(drawingId, "comment-thread-created", { thread: payload });
      return res.status(201).json({ thread: payload });
    }),
  );

  // POST /comment-threads/:threadId/comments — reply
  app.post(
    "/comment-threads/:threadId/comments",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const { threadId } = req.params;

      const existing = await prisma.commentThread.findUnique({
        where: { id: threadId },
        select: { drawingId: true },
      });
      if (!existing) return res.status(404).json({ error: "Thread not found" });

      const access = await readAccess(req.user.id, existing.drawingId);
      if (!canViewDrawing(access)) {
        return res.status(404).json({ error: "Thread not found" });
      }
      if (!canEditDrawing(access)) {
        return res.status(403).json({ error: "Viewers cannot post comments" });
      }

      const content = parseContent(req.body?.content);
      if (!content) {
        return res.status(400).json({
          error: "Validation error",
          message: `Comment must be between 1 and ${MAX_COMMENT_LENGTH} characters`,
        });
      }

      const mentions = await sanitizeMentions(
        req.body?.mentions,
        existing.drawingId,
      );

      await prisma.comment.create({
        data: {
          threadId,
          content,
          mentions: JSON.stringify(mentions),
          createdById: req.user.id,
        },
      });
      // Touch the thread so sorting by recent activity works.
      await prisma.commentThread.update({
        where: { id: threadId },
        data: { updatedAt: new Date() },
      });

      const thread = await prisma.commentThread.findUnique({
        where: { id: threadId },
        include: threadInclude,
      });
      if (!thread) return res.status(404).json({ error: "Thread not found" });

      const payload = await serializeOneThread(thread);
      broadcast(existing.drawingId, "comment-thread-updated", {
        thread: payload,
      });
      return res.status(201).json({ thread: payload });
    }),
  );

  // PATCH /comment-threads/:threadId — resolve or reopen
  app.patch(
    "/comment-threads/:threadId",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const { threadId } = req.params;

      const existing = await prisma.commentThread.findUnique({
        where: { id: threadId },
        select: { drawingId: true },
      });
      if (!existing) return res.status(404).json({ error: "Thread not found" });

      const access = await readAccess(req.user.id, existing.drawingId);
      if (!canViewDrawing(access)) {
        return res.status(404).json({ error: "Thread not found" });
      }
      if (!canEditDrawing(access)) {
        return res.status(403).json({ error: "Viewers cannot resolve threads" });
      }

      const { resolved } = req.body ?? {};
      if (typeof resolved !== "boolean") {
        return res.status(400).json({
          error: "Validation error",
          message: "resolved must be a boolean",
        });
      }

      const thread = await prisma.commentThread.update({
        where: { id: threadId },
        data: {
          resolved,
          resolvedAt: resolved ? new Date() : null,
          resolvedById: resolved ? req.user.id : null,
        },
        include: threadInclude,
      });

      const payload = await serializeOneThread(thread);
      broadcast(existing.drawingId, "comment-thread-updated", {
        thread: payload,
      });
      return res.json({ thread: payload });
    }),
  );

  // DELETE /comment-threads/:threadId — the thread's author, or the drawing's owner
  app.delete(
    "/comment-threads/:threadId",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const { threadId } = req.params;

      const existing = await prisma.commentThread.findUnique({
        where: { id: threadId },
        select: { drawingId: true, createdById: true },
      });
      if (!existing) return res.status(404).json({ error: "Thread not found" });

      const access = await readAccess(req.user.id, existing.drawingId);
      if (!canViewDrawing(access)) {
        return res.status(404).json({ error: "Thread not found" });
      }
      if (existing.createdById !== req.user.id && access !== "owner") {
        return res
          .status(403)
          .json({ error: "Only the author or the drawing owner can delete" });
      }

      await prisma.commentThread.delete({ where: { id: threadId } });
      broadcast(existing.drawingId, "comment-thread-deleted", { threadId });
      return res.json({ success: true });
    }),
  );

  // GET /drawings/:drawingId/mentionable-users?q= — who @mention can reach
  app.get(
    "/drawings/:drawingId/mentionable-users",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const { drawingId } = req.params;

      const access = await readAccess(req.user.id, drawingId);
      if (!canViewDrawing(access)) {
        return res.status(404).json({ error: "Drawing not found" });
      }

      const drawing = await prisma.drawing.findUnique({
        where: { id: drawingId },
        select: { userId: true, collectionId: true },
      });
      if (!drawing) return res.status(404).json({ error: "Drawing not found" });

      // The owner, anyone shared the drawing directly, and anyone shared the
      // collection it sits in. Deliberately not every user on the instance.
      const [directShares, collectionShares] = await Promise.all([
        prisma.drawingPermission.findMany({
          where: { drawingId },
          select: { granteeUserId: true },
        }),
        drawing.collectionId
          ? prisma.collectionShare.findMany({
              where: { collectionId: drawing.collectionId },
              select: { granteeUserId: true },
            })
          : Promise.resolve([]),
      ]);

      const candidateIds = [
        ...new Set([
          drawing.userId,
          ...directShares.map((share) => share.granteeUserId),
          ...collectionShares.map((share) => share.granteeUserId),
        ]),
      ];

      const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const users = await prisma.user.findMany({
        where: {
          id: { in: candidateIds },
          isActive: true,
          ...(query
            ? {
                OR: [
                  { name: { contains: query } },
                  { email: { contains: query } },
                ],
              }
            : {}),
        },
        select: userSummarySelect,
        orderBy: { name: "asc" },
        take: 20,
      });

      return res.json({ users });
    }),
  );
};
