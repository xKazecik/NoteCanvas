import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.integration.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    env: {
      DATABASE_PROVIDER: "sqlite",
      DATABASE_URL: "file:./prisma/test.db",
      NODE_ENV: "test",
      AUTH_MODE: "local",
    },
    pool: "forks",
    // One file at a time: integration files share a lock around
    // "prisma db push". (Vitest 4 dropped the old forks.singleFork option.)
    maxWorkers: 1,
  },
});
