// Weiterleitung von /addons-api/ext/<id>/… an den Server-Teil des Addons
import type { Route } from "./context.js";

/** Die leere Alternative statt `(…)?` liefert immer einen Text, nie `undefined` */
const EXT_PATH = /^\/addons-api\/ext\/([^/]+)(\/.*|)$/;

/** Sub-Pfad roh (nicht dekodiert), damit `%2F` die Segmente nicht verschiebt */
function rawSubPath(url: string | undefined): string {
  const path = (url ?? "/").split("?")[0];
  return EXT_PATH.exec(path)?.[2] || "/";
}

export const extRoutes: Route[] = [
  {
    method: "*",
    pattern: EXT_PATH,
    handler: (req, res, ctx, [id]) => ctx.serverAddons.handle(req, res, id, rawSubPath(req.url)),
  },
];
