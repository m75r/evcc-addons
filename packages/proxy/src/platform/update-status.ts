// Anforderung (Proxy → Root-Updater) und Status (Updater → Proxy) der Plattform-Aktualisierung
import { randomBytes } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { VERSION_PATTERN } from "../addons/manifest.js";
import { isRecord } from "../util.js";

export type UpdateState = "downloading" | "installing" | "done" | "failed";

export interface UpdateStatus {
  id: string;
  state: UpdateState;
  version: string;
  message?: string;
  /** ISO-Zeitpunkt der letzten Änderung */
  at: string;
}

export interface UpdateRequest {
  /** /^[0-9a-f]{8,32}$/ */
  id: string;
  /** erfüllt VERSION_PATTERN */
  version: string;
}

/** Relativ zu dataDir; die Path-Unit überwacht /var/lib/evcc-addons/update/request.json */
export const UPDATE_REQUEST_FILE = "update/request.json";
/** StateDirectory des Updaters, gehört root */
export const UPDATE_STATUS_DIR = "/var/lib/evcc-addons-update";
export const UPDATE_STATUS_FILE = "status.json";

const ID_PATTERN = /^[0-9a-f]{8,32}$/;
const STATES: readonly UpdateState[] = ["downloading", "installing", "done", "failed"];

/** Wirft bei ungültigem Inhalt; die Meldung nennt den Inhalt nie (er stammt vom Proxy-User) */
export function parseUpdateRequest(text: string): UpdateRequest {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Anforderung ist kein JSON");
  }
  if (!isRecord(raw)) throw new Error("Anforderung ist kein JSON-Objekt");
  if (typeof raw.id !== "string" || !ID_PATTERN.test(raw.id)) {
    throw new Error("Anforderung hat keine gültige id");
  }
  if (typeof raw.version !== "string" || !VERSION_PATTERN.test(raw.version)) {
    throw new Error("Anforderung hat keine gültige Version");
  }
  return { id: raw.id, version: raw.version };
}

/** null bei unlesbarem oder unvollständigem Inhalt */
export function parseUpdateStatus(text: string): UpdateStatus | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(raw) || !isStatusRecord(raw)) return null;
  const { id, state, version, at } = raw;
  return typeof raw.message === "string"
    ? { id, state, version, at, message: raw.message }
    : { id, state, version, at };
}

function isStatusRecord(
  raw: Record<string, unknown>,
): raw is Record<string, unknown> & UpdateStatus {
  return (
    typeof raw.id === "string" &&
    typeof raw.version === "string" &&
    typeof raw.at === "string" &&
    STATES.includes(raw.state as UpdateState)
  );
}

/**
 * Schreibt `status.json` atomar über eine Temp-Datei und `rename`; ersetzt dabei auch einen Symlink,
 * ohne dessen Ziel anzufassen. `dir` wird bei Bedarf angelegt (0755).
 */
export async function writeUpdateStatus(dir: string, status: UpdateStatus): Promise<void> {
  await writeAtomic(dir, UPDATE_STATUS_FILE, JSON.stringify(status) + "\n", 0o755);
}

/** Temp-Datei mit `wx` (folgt keinem vorhandenen Symlink), Modus 0644, dann `rename` */
export async function writeAtomic(
  dir: string,
  name: string,
  content: string,
  dirMode: number,
): Promise<void> {
  const tmp = join(dir, `${name}.${randomBytes(6).toString("hex")}.tmp`);
  try {
    await mkdir(dir, { recursive: true, mode: dirMode });
    await writeFile(tmp, content, { flag: "wx", mode: 0o644 });
    await rename(tmp, join(dir, name));
  } catch (err) {
    await rm(tmp, { force: true });
    throw new Error(`${join(dir, name)} nicht geschrieben: ${(err as Error).message}`, {
      cause: err,
    });
  }
}
