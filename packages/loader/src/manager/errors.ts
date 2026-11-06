// Übersetzung von API-Fehlercodes in Texte der Oberfläche
import { ApiError } from "../addons-client.js";
import { MESSAGES, t, type MessageKey } from "../i18n.js";

export function errorText(err: unknown, locale: string): string {
  if (err instanceof ApiError) {
    const key = `error.${err.code}`;
    if (key in MESSAGES) return t(key as MessageKey, locale, { message: err.message });
  }
  return err instanceof Error ? err.message : String(err);
}

export function isUnauthorized(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}
