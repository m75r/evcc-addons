// E2E-Fixture: Server-Teil des Anbieters, den der Dialog über api.serverApi aufruft
import type { ServerActivateFn } from "@evcc-addons/sdk/server";

export const activateServer: ServerActivateFn = (server) => {
  server.route("GET", /^\/echo$/, (_req, res) =>
    server.http.sendJson(res, 200, { echo: server.id }),
  );
};
