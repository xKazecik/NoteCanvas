import "dotenv/config";
import { defineConfig } from "prisma/config";

// Used by the Prisma CLI (migrate, db push, generate). The datasource provider
// is still swapped per deployment by rewriting prisma/schema.prisma -- see
// scripts/provider-prisma.cjs and docker-entrypoint.sh -- and migrations
// default to the "migrations" folder next to whichever schema is used.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
