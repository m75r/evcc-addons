// Vitest-Projekte: SDK und Proxy (Node), Loader und Addons (happy-dom), Server-Teile der Addons (Node)
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
        oxc: jsx,
        plugins: [cssAsText()],
        test: {
          name: "loader",
          root: "packages/loader",
          environment: "happy-dom",
          include: ["test/**/*.test.{ts,tsx}"],
        },
      },
      {
        oxc: jsx,
        plugins: [cssAsText()],
        test: {
          name: "addons",
          environment: "happy-dom",
          include: ["addons/*/test/**/*.test.{ts,tsx}"],
          exclude: ["addons/*/test/server/**"],
          passWithNoTests: true,
        },
      },
      {
        test: {
          name: "addons-server",
          environment: "node",
          include: ["addons/*/test/server/**/*.test.ts"],
          passWithNoTests: true,
        },
      },
    ],
  },
});
