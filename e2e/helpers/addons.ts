// Setzt die installierten Addons vor jedem Test auf den Seed-Zustand zurück (CLI `install --reset`)
import { resetAddons as resetTestAddons } from "@evcc-addons/sdk/testing/server";
import path from "node:path";
import { seedZips } from "../seed.mjs";

export const ROOT = path.resolve(import.meta.dirname, "../..");

export function repoPath(relative: string): string {
  return path.resolve(ROOT, relative);
}

export function resetAddons(): void {
  resetTestAddons({ root: ROOT, zips: seedZips() });
}
