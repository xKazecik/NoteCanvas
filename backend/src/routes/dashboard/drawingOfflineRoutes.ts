import express from "express";
import { getUserTrashCollectionId } from "./trash";
import type { DrawingRouteContext } from "./drawingRouteContext";

// Owner-only offline mode. While a drawing is offline the owner edits a copy
// kept in their browser and syncs it whenever they can; everyone else is
// capped at view access (see getDrawingAccess). Share rows are never touched,
// so the same permissions apply again once the drawing is back online.
export const registerDrawingOfflineRoutes = (
  app: express.Express,
  context: DrawingRouteContext,
) => {
  const {
    prisma,
    requireAuth,
    asyncHandler,
    invalidateDrawingsCache,
    revalidateDrawingAccess,
    io,
  } = context;

  // The caller's drawings (trash excluded) with whether each one is shared, so
  // the client can ask which shared drawings to take offline.
  // Registered before `/drawings/:id` so it isn't treated as a drawing id.
  app.get(
    "/drawings/offline-candidates",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const trashCollectionId = getUserTrashCollectionId(req.user.id);
      const drawings = await prisma.drawing.findMany({
        where: {
          userId: req.user.id,
          OR: [
            { collectionId: null },
            { collectionId: { notIn: [trashCollectionId, "trash"] } },
          ],
        },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          name: true,
          offlineAt: true,
          _count: {
            select: {
              permissions: true,
              linkShares: { where: { revokedAt: null } },
            },
          },
          collection: { select: { _count: { select: { shares: true } } } },
        },
      });
      return res.json({
        drawings: drawings.map((d) => ({
          id: d.id,
          name: d.name,
          offlineAt: d.offlineAt,
          isShared:
            d._count.permissions > 0 ||
            d._count.linkShares > 0 ||
            (d.collection?._count.shares ?? 0) > 0,
        })),
      });
    }),
  );

  // Sharing and offline mode are exclusive: the owner can't add people or
  // links while the drawing is offline. Registered ahead of the sharing routes;
  // anything else falls through to them unchanged.
  app.post(
    ["/drawings/:id/permissions", "/drawings/:id/link-shares"],
    requireAuth,
    asyncHandler(async (req, res, next) => {
      const drawing = await prisma.drawing.findUnique({
        where: { id: req.params.id },
        select: { userId: true, offlineAt: true },
      });
      if (drawing?.offlineAt && drawing.userId === req.user?.id) {
        return res.status(409).json({
          error: "Conflict",
          code: "DRAWING_OFFLINE",
          message: "This drawing is in offline mode. Bring it back online to share it.",
        });
      }
      return next();
    }),
  );

  app.put(
    "/drawings/:id/offline",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const { id } = req.params;
      const offline = req.body?.offline;
      if (typeof offline !== "boolean") {
        return res.status(400).json({
          error: "Validation error",
          message: "`offline` must be a boolean",
        });
      }

      const drawing = await prisma.drawing.findUnique({
        where: { id },
        select: { userId: true },
      });
      if (!drawing || drawing.userId !== req.user.id) {
        return res.status(404).json({ error: "Drawing not found" });
      }

      const updated = await prisma.drawing.update({
        where: { id },
        data: { offlineAt: offline ? new Date() : null },
        select: { offlineAt: true },
      });
      invalidateDrawingsCache();
      // Collaborators with edit access are now read-only (or editors again).
      if (revalidateDrawingAccess) {
        try {
          await revalidateDrawingAccess(id);
        } catch (err) {
          console.error("Failed to revalidate live drawing access:", err);
        }
      }
      io?.to(`drawing_${id}`).emit("drawing-offline-changed", {
        drawingId: id,
        offlineAt: updated.offlineAt,
      });
      return res.json({ offlineAt: updated.offlineAt });
    }),
  );
};
