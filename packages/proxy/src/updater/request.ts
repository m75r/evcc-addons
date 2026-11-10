// Liest und löscht die Anforderung des Proxys (request.json). Die Datei liegt in einem Verzeichnis des
// Proxy-Users; der Updater läuft als root und folgt daher keinem Symlink und öffnet keine FIFO blockierend.
import { constants } from "node:fs";
import { lstat, open, realpath, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { parseUpdateRequest, type UpdateRequest } from "../platform/update-status.js";
import { errorMessage } from "../util.js";

export type TakenRequest = { request: UpdateRequest } | { invalid: string } | null;

const MAX_BYTES = 1024;
const OPEN_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;

/**
 * null: keine Anforderung. Sonst wird die Datei in jedem Fall gelöscht (auch Symlink, FIFO, Übergröße,
 * ungültiger Inhalt), damit die Path-Unit nicht erneut auslöst. Meldungen nennen nie den Inhalt.
 */
export async function takeRequest(path: string): Promise<TakenRequest> {
  const dir = dirname(path);
  const dirState = await checkDir(dir);
  if (dirState === "missing") return null;
  if (dirState !== "ok") return { invalid: dirState };
  const result = await readRequest(path);
  if (result === null) return null;
  await removeRequest(path, dir);
  return result;
}

/** "ok", "missing" oder der Grund, warum das Verzeichnis nicht vertrauenswürdig ist */
async function checkDir(dir: string): Promise<string> {
  try {
    const stats = await lstat(dir);
    if (stats.isSymbolicLink() || !stats.isDirectory()) return `${dir} ist kein Verzeichnis`;
    if ((await realpath(dir)) !== dir) return `${dir} enthält einen Symlink`;
    return "ok";
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "missing";
    return `${dir} nicht lesbar: ${errorMessage(err)}`;
  }
}

async function readRequest(path: string): Promise<TakenRequest> {
  let handle;
  try {
    handle = await open(path, OPEN_FLAGS);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    if (code === "ELOOP") return { invalid: `${path} ist ein Symlink` };
    return { invalid: `${path} nicht lesbar (${code ?? errorMessage(err)})` };
  }
  try {
    return await readHandle(handle, path);
  } finally {
    await handle.close();
  }
}

async function readHandle(
  handle: Awaited<ReturnType<typeof open>>,
  path: string,
): Promise<TakenRequest> {
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) return { invalid: `${path} ist keine reguläre Datei` };
    if (stats.size > MAX_BYTES) return { invalid: `${path} ist größer als ${MAX_BYTES} Bytes` };
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > MAX_BYTES) return { invalid: `${path} ist größer als ${MAX_BYTES} Bytes` };
    return { request: parseUpdateRequest(buffer.subarray(0, bytesRead).toString("utf8")) };
  } catch (err) {
    return { invalid: `${path}: ${errorMessage(err)}` };
  }
}

/** `unlink` folgt keinem Symlink; vorher wird das Verzeichnis erneut geprüft */
async function removeRequest(path: string, dir: string): Promise<void> {
  const dirState = await checkDir(dir);
  if (dirState === "missing") return;
  if (dirState !== "ok") throw new Error(`${path} nicht gelöscht: ${dirState}`);
  try {
    await unlink(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw new Error(`${path} nicht gelöscht: ${errorMessage(err)}`, { cause: err });
  }
}
