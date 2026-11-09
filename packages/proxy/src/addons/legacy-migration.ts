// Einmalige Übernahme von <dataDir>/switches.json aus 1.x für das Addon switches-tapo
// TODO entfernen ab 3.0.0
import { chmod, copyFile, rename, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { Logger } from "../logger.js";
import { errorMessage } from "../util.js";
import { addonDataDir, ensureAddonDataDir } from "./addon-data.js";

const LEGACY_FILE = "switches.json";
const TARGET_ADDON = "switches-tapo";
const FILE_MODE = 0o600;

/** Verschiebt die Datei, wenn das Ziel fehlt; ein Fehler wird geloggt und hält den Start nicht auf */
export async function migrateLegacySwitches(dataDir: string, logger: Logger): Promise<void> {
  const from = join(dataDir, LEGACY_FILE);
  const to = join(addonDataDir(dataDir, TARGET_ADDON), LEGACY_FILE);
  if (!(await exists(from))) return;
  if (await exists(to)) {
    logger.info("legacy switches not migrated, target exists", { from, to });
    return;
  }
  try {
    await ensureAddonDataDir(dataDir, TARGET_ADDON);
    await moveFile(from, to);
    logger.info("legacy switches migrated", { from, to });
  } catch (err) {
    logger.error("legacy switches migration failed", { from, to, error: errorMessage(err) });
  }
}

/** Rename; über Dateisystemgrenzen Kopie mit 0600 und Löschen der Quelle */
async function moveFile(from: string, to: string): Promise<void> {
  try {
    await rename(from, to);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EXDEV") throw err;
    await copyFile(from, to);
    await chmod(to, FILE_MODE);
    await unlink(from);
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw new Error(`${path} nicht lesbar: ${errorMessage(err)}`, { cause: err });
  }
}
