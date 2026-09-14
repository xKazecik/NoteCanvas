import express from "express";
import { DashboardRouteDeps } from "./types";
import { getUserTrashCollectionId, isTrashCollectionId } from "./trash";

export const registerCollectionRoutes = (
  app: express.Express,
  deps: DashboardRouteDeps,
) => {
  const {
    prisma,
    requireAuth,
    asyncHandler,
    collectionNameSchema,
    sanitizeText,
    ensureTrashCollection,
    invalidateDrawingsCache,
    config,
    logAuditEvent,
  } = deps;

  // A collection may nest under another collection the same user owns, which is
  // what makes collections behave like folders. Three things are never allowed:
  // trash taking part in the tree at all, a collection parenting itself, and a
  // move under one of its own descendants -- the last would cut the subtree out
  // of the tree entirely by making it a cycle.
  // `error` set means the parent was rejected; this project does not compile
  // with strictNullChecks, so a discriminated union would not narrow here.
  type ParentResolution = { parentId: string | null; error?: string };

  // Colours are either one of the preset names below, which the client maps to
  // its own styling, or a `#rrggbb` hex the client renders literally.
  const COLLECTION_COLORS = [
    "slate",
    "red",
    "orange",
    "amber",
    "green",
    "teal",
    "blue",
    "violet",
    "pink",
  ];

  const HEX_COLOR = /^#[0-9a-f]{6}$/i;

  const resolveColor = (
    rawColor: unknown,
  ): { color: string | null; error?: string } => {
    if (rawColor == null || rawColor === "") return { color: null };
    if (typeof rawColor !== "string") {
      return { color: null, error: "color must be a string or null" };
    }
    if (HEX_COLOR.test(rawColor)) return { color: rawColor.toLowerCase() };
    if (!COLLECTION_COLORS.includes(rawColor)) {
      return {
        color: null,
        error: `color must be #rrggbb or one of: ${COLLECTION_COLORS.join(", ")}`,
      };
    }
    return { color: rawColor };
  };

  const resolveParentId = async (
    rawParentId: unknown,
    userId: string,
    movingCollectionId?: string,
  ): Promise<ParentResolution> => {
    if (rawParentId == null || rawParentId === "") {
      return { parentId: null };
    }
    if (typeof rawParentId !== "string") {
      return { parentId: null, error: "parentId must be a string or null" };
    }
    if (isTrashCollectionId(rawParentId, userId)) {
      return { parentId: null, error: "Trash cannot contain collections" };
    }
    if (movingCollectionId && rawParentId === movingCollectionId) {
      return { parentId: null, error: "A collection cannot be its own parent" };
    }

    const parent = await prisma.collection.findFirst({
      where: { id: rawParentId, userId },
      select: { id: true, parentId: true },
    });
    if (!parent) {
      return { parentId: null, error: "Parent collection not found" };
    }

    if (movingCollectionId) {
      // Walk up from the intended parent; meeting the collection being moved
      // means the new parent sits inside its own subtree.
      let cursor = parent.parentId;
      while (cursor) {
        if (cursor === movingCollectionId) {
          return {
            parentId: null,
            error: "A collection cannot be moved into its own subtree",
          };
        }
        const next: { parentId: string | null } | null =
          await prisma.collection.findFirst({
            where: { id: cursor, userId },
            select: { parentId: true },
          });
        cursor = next?.parentId ?? null;
      }
    }

    return { parentId: rawParentId };
  };

  // GET /collections — returns owned collections + collections shared with user
  app.get(
    "/collections",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const trashCollectionId = getUserTrashCollectionId(req.user.id);
      await ensureTrashCollection(prisma, req.user.id);

      const rawCollections = await prisma.collection.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: "desc" },
        // The drawings panel shows how much is inside each collection, and the
        // list it renders is paginated, so the count has to come from here.
        include: { _count: { select: { drawings: true, children: true } } },
      });
      const hasInternalTrash = rawCollections.some(
        (c) => c.id === trashCollectionId,
      );
      const shareCountMap = await prisma.collectionShare.groupBy({
        by: ["collectionId"],
        where: {
          collectionId: {
            in: rawCollections.map((c) => c.id),
          },
        },
        _count: { collectionId: true },
      });
      const sharedCollectionIds = new Set(
        shareCountMap.map((s) => s.collectionId),
      );

      // Flatten Prisma's _count into one number the client can render, so the
      // response shape does not leak the query's structure.
      const withItemCount = <
        T extends { _count?: { drawings: number; children: number } },
      >(
        collection: T,
      ) => {
        const { _count, ...rest } = collection;
        return {
          ...rest,
          itemCount: (_count?.drawings ?? 0) + (_count?.children ?? 0),
        };
      };

      const ownedCollections = rawCollections
        .filter((c) => !(hasInternalTrash && c.id === "trash"))
        .map((c) =>
          c.id === trashCollectionId
            ? {
                ...withItemCount(c),
                id: "trash",
                name: "Trash",
                sharedRole: null,
                isOwner: true,
                isShared: false,
              }
            : {
                ...withItemCount(c),
                sharedRole: null,
                isOwner: true,
                isShared: sharedCollectionIds.has(c.id),
              },
        );

      // Collections shared with this user by others
      const sharedEntries = await prisma.collectionShare.findMany({
        where: { granteeUserId: req.user.id },
        include: {
          collection: {
            include: {
              user: { select: { id: true, name: true, email: true } },
              _count: { select: { drawings: true, children: true } },
            },
          },
        },
      });
      const sharedCollections = sharedEntries.map((s) => ({
        ...withItemCount(s.collection),
        sharedRole: s.role,
        isOwner: false,
      }));

      return res.json([...ownedCollections, ...sharedCollections]);
    }),
  );

  // POST /collections
  app.post(
    "/collections",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

      const parsed = collectionNameSchema.safeParse(req.body.name);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation error",
          message: "Collection name must be between 1 and 100 characters",
        });
      }

      const parentResolution = await resolveParentId(
        req.body.parentId,
        req.user.id,
      );
      if (parentResolution.error) {
        return res.status(400).json({
          error: "Validation error",
          message: parentResolution.error,
        });
      }

      const colorResolution = resolveColor(req.body.color);
      if (colorResolution.error) {
        return res.status(400).json({
          error: "Validation error",
          message: colorResolution.error,
        });
      }

      const sanitizedName = sanitizeText(parsed.data, 100);
      const newCollection = await prisma.collection.create({
        data: {
          name: sanitizedName,
          userId: req.user.id,
          parentId: parentResolution.parentId,
          color: colorResolution.color,
        },
      });
      return res.json({ ...newCollection, sharedRole: null, isOwner: true });
    }),
  );

  // PUT /collections/:id — owner only
  app.put(
    "/collections/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

      const { id } = req.params;
      if (isTrashCollectionId(id, req.user.id)) {
        return res.status(400).json({
          error: "Validation error",
          message: "Trash collection cannot be renamed or moved",
        });
      }
      const existing = await prisma.collection.findFirst({
        where: { id, userId: req.user.id },
      });
      if (!existing)
        return res.status(404).json({ error: "Collection not found" });

      // Rename, move and recolour are independent: send a name, a parentId, a
      // color, or any combination of them.
      const isRename = Object.prototype.hasOwnProperty.call(req.body, "name");
      const isMove = Object.prototype.hasOwnProperty.call(req.body, "parentId");
      const isRecolor = Object.prototype.hasOwnProperty.call(req.body, "color");
      if (!isRename && !isMove && !isRecolor) {
        return res.status(400).json({
          error: "Validation error",
          message: "Provide a name, a parentId or a color",
        });
      }

      const data: {
        name?: string;
        parentId?: string | null;
        color?: string | null;
      } = {};

      if (isRecolor) {
        const colorResolution = resolveColor(req.body.color);
        if (colorResolution.error) {
          return res.status(400).json({
            error: "Validation error",
            message: colorResolution.error,
          });
        }
        data.color = colorResolution.color;
      }

      if (isRename) {
        const parsed = collectionNameSchema.safeParse(req.body.name);
        if (!parsed.success) {
          return res.status(400).json({
            error: "Validation error",
            message: "Collection name must be between 1 and 100 characters",
          });
        }
        data.name = sanitizeText(parsed.data, 100);
      }

      if (isMove) {
        const parentResolution = await resolveParentId(
          req.body.parentId,
          req.user.id,
          id,
        );
        if (parentResolution.error) {
          return res.status(400).json({
            error: "Validation error",
            message: parentResolution.error,
          });
        }
        data.parentId = parentResolution.parentId;
      }

      await prisma.collection.updateMany({
        where: { id, userId: req.user.id },
        data,
      });
      const updated = await prisma.collection.findFirst({
        where: { id, userId: req.user.id },
      });
      if (!updated)
        return res.status(404).json({ error: "Collection not found" });
      return res.json(updated);
    }),
  );

  // DELETE /collections/:id — owner only
  app.delete(
    "/collections/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

      const { id } = req.params;
      if (isTrashCollectionId(id, req.user.id)) {
        return res.status(400).json({
          error: "Validation error",
          message: "Trash collection cannot be deleted",
        });
      }
      const collection = await prisma.collection.findFirst({
        where: { id, userId: req.user.id },
      });
      if (!collection)
        return res.status(404).json({ error: "Collection not found" });

      await prisma.$transaction([
        prisma.drawing.updateMany({
          where: { collectionId: id, userId: req.user.id },
          data: { collectionId: null },
        }),
        // Nested collections outlive their parent: they move up to where the
        // deleted one sat, so deleting a folder never takes its subtree with it.
        prisma.collection.updateMany({
          where: { parentId: id, userId: req.user.id },
          data: { parentId: collection.parentId },
        }),
        prisma.collectionShare.deleteMany({ where: { collectionId: id } }),
        prisma.collection.deleteMany({ where: { id, userId: req.user.id } }),
      ]);
      invalidateDrawingsCache();

      if (config.enableAuditLogging) {
        await logAuditEvent({
          userId: req.user.id,
          action: "collection_deleted",
          resource: `collection:${id}`,
          ipAddress: req.ip || req.connection.remoteAddress || undefined,
          userAgent: req.headers["user-agent"] || undefined,
          details: { collectionId: id, collectionName: collection.name },
        });
      }

      return res.json({ success: true });
    }),
  );

  // ─── Collection Sharing ───────────────────────────────────────────────────

  // GET /collections/:id/shares — list shares (owner only)
  app.get(
    "/collections/:id/shares",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const { id } = req.params;

      const collection = await prisma.collection.findFirst({
        where: { id, userId: req.user.id },
      });
      if (!collection)
        return res.status(404).json({ error: "Collection not found" });

      const shares = await prisma.collectionShare.findMany({
        where: { collectionId: id },
        include: {
          granteeUser: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "asc" },
      });

      return res.json({ shares });
    }),
  );

  // POST /collections/:id/shares — add or update a user share (owner only)
  app.post(
    "/collections/:id/shares",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const { id } = req.params;
      const { identifier, role } = req.body as {
        identifier: string;
        role: string;
      };

      if (!identifier || !["view", "edit"].includes(role)) {
        return res
          .status(400)
          .json({ error: "identifier and role (view|edit) are required" });
      }

      const collection = await prisma.collection.findFirst({
        where: { id, userId: req.user.id },
      });
      if (!collection)
        return res.status(404).json({ error: "Collection not found" });

      // Resolve user by email or username
      const grantee = await prisma.user.findFirst({
        where: {
          isActive: true,
          OR: [
            { email: identifier.toLowerCase() },
            { username: identifier },
            { name: identifier },
          ],
        },
        select: { id: true, name: true, email: true },
      });
      if (!grantee) return res.status(404).json({ error: "User not found" });
      if (grantee.id === req.user.id)
        return res.status(400).json({ error: "Cannot share with yourself" });

      const share = await prisma.collectionShare.upsert({
        where: {
          collectionId_granteeUserId: {
            collectionId: id,
            granteeUserId: grantee.id,
          },
        },
        update: { role, updatedAt: new Date() },
        create: {
          collectionId: id,
          granteeUserId: grantee.id,
          role,
          createdByUserId: req.user.id,
        },
        include: {
          granteeUser: { select: { id: true, name: true, email: true } },
        },
      });
      invalidateDrawingsCache();

      return res.json({ share });
    }),
  );

  // PATCH /collections/:id/shares/:userId — update role (owner only)
  app.patch(
    "/collections/:id/shares/:userId",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const { id, userId } = req.params;
      const { role } = req.body as { role: string };

      if (!["view", "edit"].includes(role)) {
        return res.status(400).json({ error: "role must be view or edit" });
      }

      const collection = await prisma.collection.findFirst({
        where: { id, userId: req.user.id },
      });
      if (!collection)
        return res.status(404).json({ error: "Collection not found" });

      const share = await prisma.collectionShare.updateMany({
        where: { collectionId: id, granteeUserId: userId },
        data: { role, updatedAt: new Date() },
      });
      if (share.count === 0)
        return res.status(404).json({ error: "Share not found" });
      invalidateDrawingsCache();

      return res.json({ success: true });
    }),
  );

  // DELETE /collections/:id/shares/:userId — remove a user (owner only)
  app.delete(
    "/collections/:id/shares/:userId",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const { id, userId } = req.params;

      const collection = await prisma.collection.findFirst({
        where: { id, userId: req.user.id },
      });
      if (!collection)
        return res.status(404).json({ error: "Collection not found" });

      await prisma.collectionShare.deleteMany({
        where: { collectionId: id, granteeUserId: userId },
      });
      invalidateDrawingsCache();
      return res.json({ success: true });
    }),
  );

  // GET /collections/:id/share-resolve — search users to share with (owner only)
  app.get(
    "/collections/:id/share-resolve",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const { id } = req.params;
      const q = String(req.query.q || "").trim();

      if (q.length < 2) return res.json({ users: [] });

      const collection = await prisma.collection.findFirst({
        where: { id, userId: req.user.id },
      });
      if (!collection)
        return res.status(404).json({ error: "Collection not found" });

      // Get already-shared user IDs to exclude them
      const existing = await prisma.collectionShare.findMany({
        where: { collectionId: id },
        select: { granteeUserId: true },
      });
      const excludeIds = [req.user.id, ...existing.map((s) => s.granteeUserId)];

      const users = await prisma.user.findMany({
        where: {
          isActive: true,
          id: { notIn: excludeIds },
          OR: [
            { email: { contains: q } },
            { name: { contains: q } },
            { username: { contains: q } },
          ],
        },
        select: { id: true, name: true, email: true },
        take: 8,
      });

      return res.json({ users });
    }),
  );
};
