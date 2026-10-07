import path from "path";

/**
 * Resolve DATABASE_URL the way Prisma 5 did: relative file: paths are relative
 * to backend/prisma (so "file:./dev.db" is backend/prisma/dev.db), and an
 * unset URL means that default database. Prisma 7's SQLite adapter resolves
 * relative paths against the working directory instead, so callers pass the
 * result of this to createPrismaClient.
 */
export const resolveDatabaseUrl = (rawUrl?: string): string => {
  const backendRoot = path.resolve(__dirname, "../../");
  const defaultDbPath = path.resolve(backendRoot, "prisma/dev.db");

  if (!rawUrl || rawUrl.trim().length === 0) {
    return `file:${defaultDbPath}`;
  }

  if (!rawUrl.startsWith("file:")) {
    return rawUrl;
  }

  const filePath = rawUrl.replace(/^file:/, "");
  const prismaDir = path.resolve(backendRoot, "prisma");
  const normalizedRelative = filePath.replace(/^\.\/?/, "");
  const hasLeadingPrismaDir =
    normalizedRelative === "prisma" || normalizedRelative.startsWith("prisma/");

  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(
        hasLeadingPrismaDir ? backendRoot : prismaDir,
        normalizedRelative,
      );

  return `file:${absolutePath}`;
};
