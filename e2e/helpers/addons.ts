// Setzt die installierten Addons vor jedem Test auf den Seed-Zustand zurück
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(import.meta.dirname, "../..");

export function repoPath(relative: string): string {
  return path.resolve(ROOT, relative);
}

export function resetAddons(): void {
  const seed = JSON.parse(readFileSync(repoPath("e2e/fixtures/seed.json"), "utf8")) as {
    zips: string[];
  };
  execFileSync(
    process.execPath,
    [
      repoPath("packages/proxy/dist/server.mjs"),
      "install",
      "--config",
      repoPath("e2e/fixtures/proxy.config.json"),
      "--reset",
      ...seed.zips.map(repoPath),
    ],
    { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"] },
  );
}
