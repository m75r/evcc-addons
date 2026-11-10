// Vitest-Projekte: SDK, Proxy und Skripte (Node), Loader (happy-dom)
import { defaultClientConditions, defaultServerConditions } from "vite";
import { defineConfig } from "vitest/config";
import { cssAsText } from "./packages/sdk/src/vitest.js";

const jsx = { jsx: { runtime: "automatic", importSource: "preact" } } as const;
/** Pakete des Monorepos aus dem Quelltext (Exportbedingung `source`), ohne vorher zu bauen */
const resolve = { conditions: ["source", ...defaultClientConditions] };
const ssr = { resolve: { conditions: ["source", ...defaultServerConditions] } };

export default defineConfig({
  resolve,
  ssr,
  test: {
    projects: [
      {
        test: {
          name: "sdk",
          root: "packages/sdk",
          environment: "node",
          include: ["test/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "proxy",
          root: "packages/proxy",
          environment: "node",
          include: ["test/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "scripts",
          root: "scripts",
          environment: "node",
          include: ["test/**/*.test.mjs"],
        },
      },
      {
        oxc: jsx,
        plugins: [cssAsText()],
        test: {
          name: "loader",
          root: "packages/loader",
          environment: "happy-dom",
          include: ["test/**/*.test.{ts,tsx}"],
        },
      },
    ],
  },
});
