// Fehlertexte der Oberfläche (Kopie aus packages/loader/src/manager/errors.ts, ohne Install-Codes)
import { ApiError } from "../dialog/client.js";

/** Die Meldungen des Gateways sind bereits für die Oberfläche formuliert */
export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function isUnauthorized(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}
