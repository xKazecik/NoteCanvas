// Prisma 7 generates the client as TypeScript, so plain-Node scripts load it
// through the app's createPrismaClient: from source via ts-node in a checkout,
// or from the compiled dist/ in the Docker image (which ships no src/).

const fs = require("fs");
const path = require("path");
const { normalizeDatabaseUrl } = require("./provider-prisma.cjs");

const loadFactory = () => {
  const source = path.resolve(__dirname, "../src/db/createPrismaClient.ts");
  if (fs.existsSync(source)) {
    require("ts-node").register({ transpileOnly: true });
    return require(source);
  }
  return require(path.resolve(__dirname, "../dist/db/createPrismaClient.js"));
};

/** A Prisma client for DATABASE_URL (relative file: paths resolve against backend/prisma). */
const createPrismaClient = (databaseUrl = process.env.DATABASE_URL) =>
  loadFactory().createPrismaClient(normalizeDatabaseUrl(databaseUrl));

module.exports = { createPrismaClient };
