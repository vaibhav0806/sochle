import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      exclude: ["**/index.ts", "**/schema/**", "**/*.test.ts"],
      include: [
        "apps/web/lib/money.ts",
        "apps/web/lib/presentation/**/*.ts",
        "apps/web/lib/server/data-deletion.ts",
        "apps/web/lib/server/decision-service.ts",
        "packages/contracts/src/**/*.ts",
        "packages/db/src/**/*.ts",
        "packages/domain/src/**/*.ts",
        "packages/fixtures/src/**/*.ts",
        "packages/fold/src/**/*.ts",
      ],
      provider: "v8",
      reporter: ["text", "json", "html"],
      thresholds: {
        branches: 75,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
    projects: [
      {
        test: {
          exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
          include: ["apps/**/*.test.{ts,tsx}", "packages/**/*.test.ts"],
          name: "unit",
        },
      },
      {
        test: {
          fileParallelism: false,
          exclude: ["**/node_modules/**"],
          include: ["apps/**/*.integration.test.ts", "packages/**/*.integration.test.ts"],
          name: "integration",
        },
      },
    ],
  },
});
