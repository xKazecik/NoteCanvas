import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { logAuditEvent } from "../utils/audit";
import { clearAuthCookies } from "./cookies";
import { canUseLocalPasswordFlows } from "./localPassword";
import { deleteUserAccount } from "./deleteUserAccount";
import { deleteAccountSchema } from "./schemas";
import type { RegisterAccountRoutesDeps } from "./accountRoutes";

export const registerAccountDeleteRoutes = (
  deps: RegisterAccountRoutesDeps,
) => {
  const {
    router,
    prisma,
    requireAuth,
    accountActionRateLimiter,
    ensureAuthEnabled,
    config,
    requireCsrf,
  } = deps;

  router.delete(
    "/account",
    requireAuth,
    accountActionRateLimiter,
    async (req: Request, res: Response) => {
      try {
        if (!(await ensureAuthEnabled(res))) return;
        if (!requireCsrf(req, res)) return;
        if (!req.user) {
          return res.status(401).json({
            error: "Unauthorized",
            message: "User not authenticated",
          });
        }
        if (req.user.impersonatorId) {
          return res.status(403).json({
            error: "Forbidden",
            message: "Accounts cannot be deleted while impersonating",
          });
        }

        const parsed = deleteAccountSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          return res.status(400).json({
            error: "Validation error",
            message: "Invalid delete payload",
          });
        }

        const user = await prisma.user.findUnique({
          where: { id: req.user.id },
          select: { id: true, email: true, role: true, passwordHash: true },
        });
        if (!user) {
          return res
            .status(404)
            .json({ error: "Not found", message: "User not found" });
        }

        if (canUseLocalPasswordFlows(user)) {
          if (!parsed.data.currentPassword) {
            return res.status(400).json({
              error: "Validation error",
              message: "Current password is required to delete your account",
            });
          }
          const passwordValid = await bcrypt.compare(
            parsed.data.currentPassword,
            user.passwordHash,
          );
          if (!passwordValid) {
            return res.status(401).json({
              error: "Unauthorized",
              message: "Current password is incorrect",
            });
          }
        }

        // Losing the last admin would leave nobody able to administer the
        // instance, so that account has to hand over the role first.
        if (user.role === "ADMIN") {
          const admins = await prisma.user.count({
            where: { role: "ADMIN", isActive: true },
          });
          if (admins <= 1) {
            return res.status(409).json({
              error: "Conflict",
              message:
                "There must be at least one active admin; promote another user first",
            });
          }
        }

        await deleteUserAccount(prisma, user.id);
        clearAuthCookies(req, res);

        if (config.enableAuditLogging) {
          await logAuditEvent({
            action: "account_deleted",
            resource: `user:${user.id}`,
            ipAddress: req.ip || req.connection.remoteAddress || undefined,
            userAgent: req.headers["user-agent"] || undefined,
            details: { deletedUserId: user.id, method: "self_service" },
          });
        }

        return res.json({ ok: true });
      } catch (error) {
        console.error("Delete account error:", error);
        return res.status(500).json({
          error: "Internal server error",
          message: "Failed to delete account",
        });
      }
    },
  );
};
