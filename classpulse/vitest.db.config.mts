import { defineConfig } from "vitest/config";

// Database integration tests: need a PostgreSQL superuser connection in TEST_DATABASE_URL.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["tests/db/**/*.test.ts"],
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
});
