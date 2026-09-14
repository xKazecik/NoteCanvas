import { Request, Response } from "express";
import { logAuditEvent } from "../utils/audit";
import { deleteUserAccount } from "./deleteUserAccount";
import type { RegisterAdminRoutesDeps } from "./adminRoutes";

export const registerAdminUserDeleteRoutes = (
  deps: RegisterAdminRoutesDeps,
) => {
  const {
    router,
    prisma,
    requireAuth,
    accountActionRateLimiter,
    ensureAuthEnabled,
    requireAdmin,
    countActiveAdmins,
    config,
    requireCsrf,
  } = deps;

  router.delete(
    "/users/:id",
    requireAuth,
    accountActionRateLimiter,
    async (req: Request, res: Response) => {
      try {
        if (!(await ensureAuthEnabled(res))) return;
        if (!requireCsrf(req, res)) return;
        if (!requireAdmin(req, res)) return;

        const userId = String(req.params.id || "").trim();
        if (!userId) {
          return res
            .status(400)
            .json({ error: "Bad request", message: "Invalid user id" });
        }
        // Deleting yourself here would end the session that is doing the
        // deleting; Profile has its own password-confirmed flow for that.
        if (userId === req.user.id) {
          return res.status(409).json({
            error: "Conflict",
            message: "You cannot delete your own account from the admin panel",
          });
        }

        const target = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true, role: true, isActive: true },
        });
        if (!target) {
          return res
            .status(404)
            .json({ error: "Not found", message: "User not found" });
        }

        if (target.role === "ADMIN" && target.isActive) {
          const admins = await countActiveAdmins();
          if (admins <= 1) {
            return res.status(409).json({
              error: "Conflict",
              message: "There must be at least one active admin",
            });
          }
        }

        await deleteUserAccount(prisma, target.id);

        if (config.enableAuditLogging) {
          await logAuditEvent({
            userId: req.user.id,
            action: "admin_user_deleted",
            resource: `user:${target.id}`,
            ipAddress: req.ip || req.connection.remoteAddress || undefined,
            userAgent: req.headers["user-agent"] || undefined,
            details: { deletedUserId: target.id, email: target.email },
          });
        }

        return res.json({ ok: true });
      } catch (error) {
        console.error("Delete user error:", error);
        return res.status(500).json({
          error: "Internal server error",
          message: "Failed to delete user",
        });
      }
    },
  );
};
