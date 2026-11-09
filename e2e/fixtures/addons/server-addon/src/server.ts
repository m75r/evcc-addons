// E2E-Fixture: Server-Teil mit Echo, Admin-Route, Datei im Datenordner und Einstellungen
import type { ServerActivateFn, ServerApi } from "@evcc-addons/sdk/server";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Zählt Aufrufe in `<dataDir>/visits.txt` und liefert den neuen Stand */
async function countVisit(server: ServerApi): Promise<number> {
  const file = join(server.dataDir, "visits.txt");
  let visits = 0;
  try {
    visits = Number(await readFile(file, "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  await writeFile(file, String(visits + 1));
  return visits + 1;
}

export const activateServer: ServerActivateFn = (server) => {
  const { sendJson } = server.http;
  server.route("GET", /^\/echo$/, (_req, res) => sendJson(res, 200, { echo: server.id }));
  server.route("GET", /^\/admin$/, async (req, res) => {
    await server.auth.require(req);
    sendJson(res, 200, { admin: true });
  });
  server.route("GET", /^\/data$/, async (_req, res) => {
    sendJson(res, 200, { visits: await countVisit(server) });
  });
  server.route("GET", /^\/settings$/, (_req, res) => sendJson(res, 200, server.settings.all()));
};
