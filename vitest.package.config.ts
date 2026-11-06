// Paket-Tests (Docker): laufen nur über `npm run test:package`, nicht in `npm test`
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "packaging",
    include: ["packaging/test/**/*.test.ts"],
    environment: "node",
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
});
