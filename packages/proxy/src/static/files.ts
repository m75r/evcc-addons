// Auslieferung statischer Dateien mit Traversal-Schutz und schwacher ETag
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";
import { pipeline } from "node:stream";
import type { Logger } from "../logger.js";
import { errorMessage } from "../util.js";

const CONTENT_TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".html": "text/html; charset=utf-8",
};

export function contentTypeFor(path: string): string {
  return CONTENT_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
}

/** Löst `relPath` (URL-kodiert) sicher unterhalb von `rootDir` auf, sonst `null` */
export function resolveInside(rootDir: string, relPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(relPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.includes("\\")) return null;
  const root = resolve(rootDir);
  const full = resolve(root, "." + "/" + decoded);
  return full.startsWith(root + sep) ? full : null;
}

export async function serveFile(
  req: IncomingMessage,
  res: ServerResponse,
  rootDir: string,
  relPath: string,
  logger: Logger,
): Promise<void> {
  if (req.method !== "GET" && req.method !== "HEAD")
    return sendStatus(res, 405, "Method Not Allowed");
  const full = resolveInside(rootDir, relPath);
  const info = full ? await statFile(full) : null;
  if (!full || !info) return sendStatus(res, 404, "Not Found");
  const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
  const headers = { etag, "cache-control": "no-cache", "content-type": contentTypeFor(full) };
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, headers);
    res.end();
    return;
  }
  // Client kann während stat() gegangen sein; pipeline() auf einen zerstörten Stream wirft
  if (res.destroyed) return;
  res.writeHead(200, { ...headers, "content-length": info.size });
  if (req.method === "HEAD") return void res.end();
  pipeline(createReadStream(full), res, (err) => {
    if (err) logger.warn("static file failed", { path: req.url, error: errorMessage(err) });
  });
}

async function statFile(path: string): Promise<{ size: number; mtimeMs: number } | null> {
  try {
    const info = await stat(path);
    return info.isFile() ? info : null;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

function isNotFound(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

function sendStatus(res: ServerResponse, status: number, text: string): void {
  res.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(text + "\n");
}
