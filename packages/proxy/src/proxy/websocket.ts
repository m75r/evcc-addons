// Weiterleitung von WebSocket-Upgrades (z. B. /ws) per Socket-Piping
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { Logger } from "../logger.js";
import { errorMessage } from "../util.js";
import { requestModule, targetPath } from "./forward.js";

/** Offene Upgrade-Sockets, damit sie beim Herunterfahren geschlossen werden können */
export class UpgradeTracker {
  private readonly sockets = new Set<Duplex>();

  track(socket: Duplex): void {
    this.sockets.add(socket);
    socket.once("close", () => this.sockets.delete(socket));
  }

  get size(): number {
    return this.sockets.size;
  }

  destroyAll(): void {
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
  }
}

export interface UpgradeOptions {
  logger: Logger;
  tracker: UpgradeTracker;
}

export function forwardUpgrade(
  req: IncomingMessage,
  clientSocket: Duplex,
  head: Buffer,
  target: URL,
  opts: UpgradeOptions,
): void {
  opts.tracker.track(clientSocket);
  clientSocket.on("error", (err) =>
    opts.logger.debug("websocket client error", { error: errorMessage(err) }),
  );
  const upstream = requestModule(target).request(target, {
    method: req.method,
    path: targetPath(target, req.url),
    headers: { ...req.headers, host: target.host },
  });
  upstream.on("upgrade", (upRes, upSocket, upHead) => {
    opts.tracker.track(upSocket);
    connectSockets({ upRes, upSocket, upHead, clientSocket, head, logger: opts.logger });
  });
  upstream.on("response", (upRes) => rejectUpgrade(upRes, clientSocket));
  upstream.on("error", (err) => {
    opts.logger.error("evcc unreachable", { path: req.url, error: errorMessage(err) });
    endWithStatus(clientSocket, "HTTP/1.1 502 Bad Gateway\r\nconnection: close\r\n\r\n");
  });
  upstream.end();
}

interface SocketPair {
  upRes: IncomingMessage;
  upSocket: Duplex;
  upHead: Buffer;
  clientSocket: Duplex;
  head: Buffer;
  logger: Logger;
}

function connectSockets({ upRes, upSocket, upHead, clientSocket, head, logger }: SocketPair) {
  if (clientSocket.destroyed) {
    upSocket.destroy();
    return;
  }
  clientSocket.write(statusAndHeaders(upRes, upRes.rawHeaders));
  if (upHead.length > 0) clientSocket.write(upHead);
  if (head.length > 0) upSocket.write(head);
  upSocket.on("error", (err) => logger.debug("websocket evcc error", { error: errorMessage(err) }));
  // Fehler oder Schließen auf einer Seite beendet beide Seiten
  for (const [a, b] of [
    [upSocket, clientSocket],
    [clientSocket, upSocket],
  ] as const) {
    a.on("close", () => b.destroy());
    a.pipe(b);
  }
}

/** evcc hat das Upgrade abgelehnt (z. B. 400): Antwort weitergeben und schließen */
function rejectUpgrade(upRes: IncomingMessage, clientSocket: Duplex): void {
  const raw = withoutHeaders(upRes.rawHeaders, ["transfer-encoding", "connection"]);
  clientSocket.write(statusAndHeaders(upRes, [...raw, "connection", "close"]));
  upRes.pipe(clientSocket);
  upRes.on("error", () => clientSocket.destroy());
}

function statusAndHeaders(upRes: IncomingMessage, rawHeaders: string[]): string {
  let text = `HTTP/1.1 ${upRes.statusCode} ${upRes.statusMessage ?? ""}\r\n`;
  for (let i = 0; i < rawHeaders.length; i += 2) {
    text += `${rawHeaders[i]}: ${rawHeaders[i + 1]}\r\n`;
  }
  return text + "\r\n";
}

function withoutHeaders(rawHeaders: string[], names: string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < rawHeaders.length; i += 2) {
    if (!names.includes(rawHeaders[i].toLowerCase())) result.push(rawHeaders[i], rawHeaders[i + 1]);
  }
  return result;
}

function endWithStatus(socket: Duplex, response: string): void {
  if (socket.writable) socket.end(response);
  else socket.destroy();
}
