// E2E-Fixture: activateServer wirft einen Fehler
import type { ServerActivateFn } from "@evcc-addons/sdk/server";

export const activateServer: ServerActivateFn = () => {
  throw new Error("kaputt");
};
