// Weiterleitung von HTTP-Anfragen an evcc (Streaming, optional HTML-Umschreibung)
import http, {
  type IncomingHttpHeaders,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import https from "node:https";
import { pipeline } from "node:stream";
import type { Logger } from "../logger.js";
import { errorMessage } from "../util.js";

export interface ForwardOptions {
  logger: Logger;
  /** Wird nur für HTML-Antworten ohne Content-Encoding aufgerufen */
  transformHtml?: (html: string) => string;
}

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
]);

/** Entfernt Hop-by-hop-Header inkl. der im Connection-Header genannten */
export function stripHopByHop(headers: IncomingHttpHeaders): IncomingHttpHeaders {
  const named = String(headers.connection ?? "")
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  const result: IncomingHttpHeaders = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined || HOP_BY_HOP.has(key) || named.includes(key)) continue;
    result[key] = value;
  }
  return result;
}

export function requestModule(target: URL): typeof http | typeof https {
  return target.protocol === "https:" ? https : http;
}

/** Zielpfad: Pfad der evcc-URL plus Pfad der Anfrage */
export function targetPath(target: URL, reqUrl: string | undefined): string {
  return target.pathname.replace(/\/+$/, "") + (reqUrl ?? "/");
}

export function forwardRequest(
  req: IncomingMessage,
  res: ServerResponse,
  target: URL,
  opts: ForwardOptions,
): void {
  const headers = stripHopByHop(req.headers);
  headers.host = target.host;
  if (opts.transformHtml) delete headers["accept-encoding"];
  const upstream = requestModule(target).request(target, {
    method: req.method,
    path: targetPath(target, req.url),
    headers,
  });
  upstream.on("response", (upRes) => handleResponse(upRes, res, opts));
  upstream.on("error", (err) => handleUpstreamError(err, req, res, opts.logger));
  pipeline(req, upstream, (err) => {
    if (err) opts.logger.debug("request body aborted", { path: req.url, error: errorMessage(err) });
  });
}

function handleResponse(upRes: IncomingMessage, res: ServerResponse, opts: ForwardOptions): void {
  // Client hat aufgegeben, bevor evcc antwortete (z. B. Neuladen der Seite): pipeline() würde
  // synchron ERR_STREAM_UNABLE_TO_PIPE werfen und den Prozess beenden
  if (res.destroyed) {
    opts.logger.debug("client disconnected before response", { status: upRes.statusCode });
    upRes.destroy();
    return;
  }
  const headers = stripHopByHop(upRes.headers);
  const status = upRes.statusCode ?? 502;
  if (opts.transformHtml && isUncompressedHtml(upRes)) {
    bufferAndTransform(upRes, res, { status, headers, transform: opts.transformHtml, opts });
    return;
  }
  res.writeHead(status, upRes.statusMessage, headers);
  pipeline(upRes, res, (err) => {
    if (err) opts.logger.debug("response aborted", { error: errorMessage(err) });
  });
}

function isUncompressedHtml(upRes: IncomingMessage): boolean {
  const type = String(upRes.headers["content-type"] ?? "").toLowerCase();
  const encoding = String(upRes.headers["content-encoding"] ?? "identity").toLowerCase();
  return type.startsWith("text/html") && encoding === "identity";
}

interface TransformContext {
  status: number;
  headers: IncomingHttpHeaders;
  transform: (html: string) => string;
  opts: ForwardOptions;
}

function bufferAndTransform(upRes: IncomingMessage, res: ServerResponse, ctx: TransformContext) {
  const chunks: Buffer[] = [];
  upRes.on("data", (chunk: Buffer) => chunks.push(chunk));
  upRes.on("error", (err) => {
    ctx.opts.logger.error("evcc response failed", { error: errorMessage(err) });
    res.destroy(err);
  });
  upRes.on("end", () => {
    if (res.destroyed) return;
    const body = Buffer.from(ctx.transform(Buffer.concat(chunks).toString("utf8")), "utf8");
    const headers = { ...ctx.headers, "content-length": String(body.length) };
    delete headers.etag;
    res.writeHead(ctx.status, upRes.statusMessage, headers);
    res.end(body);
  });
}

function handleUpstreamError(
  err: Error,
  req: IncomingMessage,
  res: ServerResponse,
  logger: Logger,
): void {
  if (req.socket.destroyed) {
    // Client hat die Verbindung selbst beendet, evcc ist nicht die Ursache
    logger.debug("client disconnected", { path: req.url, error: errorMessage(err) });
    return;
  }
  logger.error("evcc unreachable", { path: req.url, error: errorMessage(err) });
  if (res.headersSent) {
    res.destroy(err);
    return;
  }
  const body = "evcc nicht erreichbar\n";
  res.writeHead(502, {
    "content-type": "text/plain; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  res.end(body);
}
