#!/usr/bin/env node
// Generates one Prisma client per supported database. Prisma 7 clients are
// provider-specific TypeScript compiled together with the app, so both are
// built ahead of time and src/db/createPrismaClient.ts picks one at runtime:
//   prisma/schema.prisma (sqlite)  -> src/generated
//   same schema as postgresql      -> src/generated/postgresql

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { rewriteSchemaProvider } = require("./provider-prisma.cjs");

const backendRoot = path.resolve(__dirname, "..");
const schemaFile = path.join(backendRoot, "prisma", "schema.prisma");
// Next to the real schema so its relative output path resolves the same way.
const postgresSchemaFile = path.join(backendRoot, "prisma", "schema.postgresql.prisma");
const npxBin = process.platform === "win32" ? "npx.cmd" : "npx";

const generate = (schema) =>
  execFileSync(npxBin, ["prisma", "generate", "--schema", schema], {
    cwd: backendRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

const outputPattern = /(output\s*=\s*)"\.\.\/src\/generated"/;
const schema = fs.readFileSync(schemaFile, "utf8");
if (!outputPattern.test(schema)) {
  throw new Error('prisma/schema.prisma must set output = "../src/generated"');
}

// SQLite first: it owns src/generated, the PostgreSQL client nests inside it.
generate(schemaFile);

fs.writeFileSync(
  postgresSchemaFile,
  rewriteSchemaProvider(schema, "postgresql").replace(
    outputPattern,
    '$1"../src/generated/postgresql"',
  ),
);
try {
  generate(postgresSchemaFile);
} finally {
  fs.rmSync(postgresSchemaFile, { force: true });
}
