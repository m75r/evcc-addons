// Minimaler Fake-evcc für Integrationstests (HTTP, gzip, WebSocket)
import { createHash } from "node:crypto";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { gzipSync } from "node:zlib";

export const INDEX_HTML =
  '<!doctype html><html lang="de"><head><title>evcc</title></head>' +
  '<body><div id="app"></div></body></html>';
export const STATE = { pvPower: 1000, loadpoints: [{ title: "Carport" }] };
export const WS_WELCOME = JSON.stringify({ pvPower: 1000 });

/** Verhalten von /api/auth/status: "cookie" prüft den Login-Cookie, sonst feste Antwort */
export type AuthMode = "cookie" | true | false | 501 | 403 | { delayMs: number };

export const FAKE_PASSWORD = "secret";
export const FAKE_COOKIE = "auth=valid";
export const FAKE_API_KEY = "Bearer key";

export interface FakeEvccOptions {
  /** Antwortet auf Upgrades mit 400 statt 101 */
  rejectUpgrade?: boolean;
  /** HTML der Startseite (Standard: INDEX_HTML) */
  indexHtml?: string;
}

export interface FakeEvcc {
  url: string;
  port: number;
  sockets: Set<Duplex>;
  /** Pro Test änderbar */
  auth: { mode: AuthMode; lastHeaders?: http.IncomingHttpHeaders };
  stop(): Promise<void>;
}

export async function startFakeEvcc(opts: FakeEvccOptions = {}, port = 0): Promise<FakeEvcc> {
  const sockets = new Set<Duplex>();
  const auth: FakeEvcc["auth"] = { mode: "cookie" };
  const server = http.createServer((req, res) => void handle(req, res, opts, auth));
  server.on("upgrade", (req: IncomingMessage, socket: Duplex) =>
    upgrade(req, socket, opts, sockets),
  );
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    port: address.port,
    sockets,
    auth,
    stop: () => stopServer(server, sockets),
  };
}

function stopServer(server: http.Server, sockets: Set<Duplex>): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
    for (const socket of sockets) socket.destroy();
  });
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  opts: FakeEvccOptions,
  auth: FakeEvcc["auth"],
) {
  const path = (req.url ?? "/").split("?")[0];
  if (req.method === "POST" && path === "/echo") return echo(req, res);
  if (path === "/api/auth/status") return authStatus(req, res, auth);
  if (req.method === "POST" && path === "/api/auth/login") return login(req, res);
  if (path === "/") {
    return send(req, res, opts.indexHtml ?? INDEX_HTML, {
      "content-type": "text/html; charset=UTF-8",
      etag: '"index-etag"',
      "cache-control": "no-store",
    });
  }
  if (path === "/slow") {
    // Antwortet verzögert, damit der Client vorher abbrechen kann
    await new Promise((resolve) => setTimeout(resolve, 100));
    return void res.writeHead(200, { "content-type": "text/plain" }).end("slow");
  }
  if (path === "/api/state") {
    return send(req, res, JSON.stringify(STATE), { "content-type": "application/json" });
  }
  res.writeHead(404).end("not found");
}

function send(
  req: IncomingMessage,
  res: ServerResponse,
  body: string,
  headers: http.OutgoingHttpHeaders,
) {
  const gzip = String(req.headers["accept-encoding"] ?? "").includes("gzip");
  const data = gzip ? gzipSync(body) : Buffer.from(body);
  res.writeHead(200, {
    ...headers,
    ...(gzip ? { "content-encoding": "gzip", vary: "Accept-Encoding" } : {}),
    "content-length": data.length,
  });
  res.end(req.method === "HEAD" ? undefined : data);
}

async function echo(req: IncomingMessage, res: ServerResponse) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = JSON.stringify({ body: Buffer.concat(chunks).toString(), headers: req.headers });
  res.writeHead(200, { "content-type": "application/json" }).end(body);
}

async function authStatus(req: IncomingMessage, res: ServerResponse, auth: FakeEvcc["auth"]) {
  auth.lastHeaders = req.headers;
  const mode = auth.mode;
  if (typeof mode === "object") await new Promise((resolve) => setTimeout(resolve, mode.delayMs));
  if (mode === 501 || mode === 403) return void res.writeHead(mode).end("error");
  const loggedIn =
    req.headers.cookie?.includes(FAKE_COOKIE) || req.headers.authorization === FAKE_API_KEY;
  const value = mode === "cookie" ? Boolean(loggedIn) : mode === true;
  res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(value));
}

async function login(req: IncomingMessage, res: ServerResponse) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const { password } = JSON.parse(Buffer.concat(chunks).toString()) as { password?: string };
  if (password !== FAKE_PASSWORD) return void res.writeHead(401).end("Invalid password");
  res.writeHead(200, { "set-cookie": `${FAKE_COOKIE}; Path=/; HttpOnly` }).end();
}

function upgrade(
  req: IncomingMessage,
  socket: Duplex,
  opts: FakeEvccOptions,
  sockets: Set<Duplex>,
) {
  if (opts.rejectUpgrade || req.headers.upgrade?.toLowerCase() !== "websocket") {
    socket.end("HTTP/1.1 400 Bad Request\r\ncontent-length: 11\r\n\r\nbad request");
    return;
  }
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
  socket.on("error", () => socket.destroy());
  const accept = createHash("sha1")
    .update(String(req.headers["sec-websocket-key"]) + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );
  socket.write(encodeFrame(1, Buffer.from(WS_WELCOME)));
  let buffer: Buffer = Buffer.alloc(0);
  socket.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    buffer = consumeFrames(buffer, socket);
  });
}

/** Unmaskierter Server-Frame (Payload < 64 KiB) */
export function encodeFrame(opcode: number, payload: Buffer): Buffer {
  const len = payload.length;
  const header =
    len < 126
      ? Buffer.from([0x80 | opcode, len])
      : Buffer.from([0x80 | opcode, 126, len >> 8, len & 0xff]);
  return Buffer.concat([header, payload]);
}

/** Verarbeitet vollständige Client-Frames: Text wird gespiegelt, Close beendet */
function consumeFrames(input: Buffer, socket: Duplex): Buffer {
  let buffer: Buffer = input;
  while (buffer.length >= 6) {
    const opcode = buffer[0] & 0x0f;
    let len = buffer[1] & 0x7f;
    let offset = 2;
    if (len === 126) {
      len = buffer.readUInt16BE(2);
      offset = 4;
    }
    if (buffer.length < offset + 4 + len) break;
    const mask = buffer.subarray(offset, offset + 4);
    const payload = Buffer.from(
      buffer.subarray(offset + 4, offset + 4 + len).map((b, i) => b ^ mask[i % 4]),
    );
    buffer = buffer.subarray(offset + 4 + len);
    if (opcode === 1) socket.write(encodeFrame(1, payload));
    if (opcode === 8) socket.end(encodeFrame(8, Buffer.alloc(0)));
  }
  return buffer;
}
