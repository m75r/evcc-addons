// Datenordner der Addons: <dataDir>/addon-data/<id>/ (0700), unabhängig vom Addon-Verzeichnis
import { chmod, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { errorMessage } from "../util.js";

const DATA_DIR_MODE = 0o700;

export function addonDataRoot(dataDir: string): string {
  return join(dataDir, "addon-data");
}

export function addonDataDir(dataDir: string, id: string): string {
  return join(addonDataRoot(dataDir), id);
}

/** Legt den Ordner an (auch den Elternordner) und setzt die Rechte auf 0700 */
export async function ensureAddonDataDir(dataDir: string, id: string): Promise<string> {
  const dir = addonDataDir(dataDir, id);
  try {
    await mkdir(dir, { recursive: true, mode: DATA_DIR_MODE });
    await chmod(addonDataRoot(dataDir), DATA_DIR_MODE);
    await chmod(dir, DATA_DIR_MODE);
  } catch (err) {
    throw new Error(`Datenordner ${dir} nicht anlegbar: ${errorMessage(err)}`, { cause: err });
  }
  return dir;
}

export async function removeAddonData(dataDir: string, id: string): Promise<void> {
  await rm(addonDataDir(dataDir, id), { recursive: true, force: true });
}

/** true, wenn der Ordner existiert und nicht leer ist */
export async function hasAddonData(dataDir: string, id: string): Promise<boolean> {
  try {
    return (await readdir(addonDataDir(dataDir, id))).length > 0;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw new Error(`Datenordner von ${id} nicht lesbar: ${errorMessage(err)}`, { cause: err });
  }
}
