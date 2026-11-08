// Routing für /addons-api/* und Abbildung von Fehlern auf HTTP-Status
import type { IncomingMessage, ServerResponse } from "node:http";
import { AddonError } from "../addons/errors.js";
import { sendError } from "../http/json.js";
import { redactPath } from "../switches/redact.js";
import { errorMessage } from "../util.js";
import type { ApiContext, Route } from "./context.js";

export type ApiRouter = (req: IncomingMessage, res: ServerResponse, path: string) => Promise<void>;

export function createApiRouter(routes: Route[], ctx: ApiContext): ApiRouter {
  return async (req, res, path) => {
    const match = findRoute(routes, req.method ?? "GET", path);
    if (!match) return sendError(res, 404, "not-found", `Unbekannter Pfad ${path}`);
    if (match === "method")
      return sendError(res, 405, "method-not-allowed", `${req.method} nicht erlaubt`);
    try {
      await match.route.handler(req, res, ctx, match.params);
    } catch (err) {
      handleApiError(req, res, err, ctx);
    }
  };
}

function findRoute(routes: Route[], method: string, path: string) {
  let pathMatched = false;
  for (const route of routes) {
    const result = route.pattern.exec(path);
    if (!result) continue;
    pathMatched = true;
    if (route.method !== method) continue;
    const params = result.slice(1).map(safeDecode);
    return { route, params };
  }
  return pathMatched ? ("method" as const) : undefined;
}

const LINGER_MS = 5000;

/**
 * Der Body wurde nicht (vollständig) gelesen, z. B. bei zu großem Upload oder fehlendem Login.
 * Ein sofortiges Schließen mit ungelesenen Daten löst einen TCP-Reset aus, der beim Client die
 * Antwort verschlucken kann. Daher nach dem Senden den Rest verwerfen (ohne zu puffern) und die
 * Verbindung spätestens nach LINGER_MS schließen.
 */
function lingerAfterResponse(req: IncomingMessage, res: ServerResponse): void {
  res.once("finish", () => {
    const timer = setTimeout(() => req.socket.destroy(), LINGER_MS);
    timer.unref();
    req.once("end", () => clearTimeout(timer));
    req.removeAllListeners("data");
    req.resume();
  });
}

/** Ungültige Kodierung bleibt roh und führt später zu `not-found` */
function safeDecode(param: string): string {
  try {
    return decodeURIComponent(param);
  } catch {
    return param;
  }
}

export function handleApiError(
  req: IncomingMessage,
  res: ServerResponse,
  err: unknown,
  ctx: ApiContext,
): void {
  if (res.headersSent) {
    ctx.logger.error("api response failed", {
      path: redactPath(req.url),
      error: errorMessage(err),
    });
    res.destroy();
    return;
  }
  if (!(err instanceof AddonError)) {
    ctx.logger.error("api request failed", { path: redactPath(req.url), error: errorMessage(err) });
    return sendError(res, 500, "internal", `Interner Fehler: ${errorMessage(err)}`);
  }
  if (!req.complete) lingerAfterResponse(req, res);
  sendError(res, err.status, err.code, err.message);
}
