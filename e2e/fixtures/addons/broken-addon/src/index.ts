// E2E-Fixture: activate wirft einen Fehler
import type { ActivateFn } from "@evcc-addons/sdk";

export const activate: ActivateFn = () => {
  throw new Error("kaputt");
};
