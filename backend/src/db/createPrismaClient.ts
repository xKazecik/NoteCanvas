import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/client";

/**
 * Build a Prisma client for a database URL. Prisma 7 talks to the database
 * through a driver adapter, and each provider has its own generated client
 * (see scripts/generate-prisma-clients.cjs), so both are chosen here.
 *
 * Deliberately free of app config so tests and the operator scripts in
 * backend/scripts can use it too. The URL must already be absolute for SQLite
 * (config.ts resolves relative file: paths against backend/prisma).
 */
export const createPrismaClient = (databaseUrl: string): PrismaClient => {
  if (/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
    // Loaded lazily so SQLite deployments never initialise the Postgres client.
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { PrismaClient: PostgresPrismaClient } =
      require("../generated/postgresql/client") as typeof import("../generated/postgresql/client");
    const { PrismaPg } =
      require("@prisma/adapter-pg") as typeof import("@prisma/adapter-pg");
    /* eslint-enable @typescript-eslint/no-require-imports */
    // The app is typed against the SQLite client; the model API is identical.
    return new PostgresPrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    }) as unknown as PrismaClient;
  }

  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databaseUrl }) });
};
