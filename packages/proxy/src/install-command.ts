// Unterbefehl `install`: installiert Addon-ZIPs direkt in dataDir (ohne laufenden Proxy)
import { mkdir, readFile, stat } from "node:fs/promises";
import { AddonStore } from "./addons/store.js";
import type { ProxyConfig } from "./config.js";
import type { Logger } from "./logger.js";
import { errorMessage } from "./util.js";

export interface InstallArgs {
  reset: boolean;
  files: string[];
}

export interface InstallDeps {
  logger: Logger;
  /** Austauschbar für Tests */
  getuid?: () => number;
}

export async function runInstall(config: ProxyConfig, args: InstallArgs, deps: InstallDeps) {
  if (args.files.length === 0 && !args.reset)
    throw new Error("install erwartet mindestens eine ZIP-Datei");
  await ensureOwnedDataDir(config.dataDir, deps.getuid ?? process.getuid);
  const store = new AddonStore({
    dataDir: config.dataDir,
    logger: deps.logger,
    limits: { maxBytes: config.maxUploadBytes },
  });
  if (args.reset) {
    await store.removeAll();
    deps.logger.info("addons reset", { dataDir: config.dataDir });
  }
  for (const file of args.files) await installFile(store, file, deps.logger);
}

async function installFile(store: AddonStore, file: string, logger: Logger): Promise<void> {
  let buffer: Buffer;
  try {
    buffer = await readFile(file);
  } catch (err) {
    throw new Error(`${file} nicht lesbar: ${errorMessage(err)}`, { cause: err });
  }
  try {
    const { addon, previousVersion } = await store.install(buffer);
    logger.info("addon installed", {
      id: addon.manifest.id,
      version: addon.manifest.version,
      previous: previousVersion ?? undefined,
      file,
    });
  } catch (err) {
    throw new Error(`${file}: ${errorMessage(err)}`, { cause: err });
  }
}

/**
 * Verweigert die Ausführung, wenn der aufrufende User nicht Eigentümer von dataDir ist.
 * Sonst entstünden z. B. bei `sudo` root-eigene Dateien, die der Dienst nicht ändern kann.
 */
async function ensureOwnedDataDir(dataDir: string, getuid: (() => number) | undefined) {
  const uid = getuid?.();
  if (uid === undefined) return;
  const owner = await ownerOf(dataDir);
  if (owner !== uid) {
    throw new Error(
      `Bitte als Eigentümer von ${dataDir} ausführen, z. B. sudo -u evcc-addons node /opt/evcc-addons/server.mjs install …`,
    );
  }
}

async function ownerOf(dir: string): Promise<number> {
  try {
    return (await stat(dir)).uid;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    await mkdir(dir, { recursive: true });
    return (await stat(dir)).uid;
  }
}
