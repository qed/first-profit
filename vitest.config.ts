import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/**/*.test.{ts,tsx}",
      "src/**/__tests__/**/*.{ts,tsx}",
      // api/ is the Vercel Functions dir (real-public-site Unit 3) — without
      // these patterns its tests would silently never run.
      "api/**/*.test.{ts,tsx}",
      "api/**/__tests__/**/*.{ts,tsx}",
    ],
  },
});
