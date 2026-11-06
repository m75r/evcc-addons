// Prüfung des evcc-Admin-Logins über GET <evcc>/api/auth/status (der Proxy speichert keine Geheimnisse)
import type { IncomingMessage } from "node:http";
import { AddonError, type AddonErrorCode } from "../addons/errors.js";
import { errorMessage } from "../util.js";

export type AuthResult =
  { ok: true } | { ok: false; status: number; code: AuthFailure; detail?: string };
export type AuthFailure = Extract<
  AddonErrorCode,
  "login-required" | "admin-password-missing" | "demo-mode" | "evcc-unreachable"
>;

const AUTH_TIMEOUT_MS = 3000;

export async function checkAdmin(
  req: Pick<IncomingMessage, "headers">,
  evccUrl: string,
  timeoutMs = AUTH_TIMEOUT_MS,
): Promise<AuthResult> {
  let status: number;
  let body: string;
  try {
    const res = await fetch(`${evccUrl}/api/auth/status`, {
      headers: forwardedAuthHeaders(req),
      signal: AbortSignal.timeout(timeoutMs),
    });
    status = res.status;
    body = await res.text();
  } catch (err) {
    return fail("evcc-unreachable", errorMessage(err));
  }
  return mapStatus(status, body);
}

/** Abbildung der evcc-Antwort: 200 true/false, 501 ohne Passwort, 403 Demo-Modus */
function mapStatus(status: number, body: string): AuthResult {
  if (status === 501) return fail("admin-password-missing");
  if (status === 403) return fail("demo-mode");
  if (status !== 200) return fail("evcc-unreachable", `HTTP ${status}`);
  return body.trim() === "true" ? { ok: true } : fail("login-required");
}

function forwardedAuthHeaders(req: Pick<IncomingMessage, "headers">): Record<string, string> {
  const headers: Record<string, string> = {};
  if (req.headers.cookie) headers.cookie = req.headers.cookie;
  if (req.headers.authorization) headers.authorization = req.headers.authorization;
  return headers;
}

const FAILURE_STATUS: Record<AuthFailure, number> = {
  "login-required": 401,
  "admin-password-missing": 403,
  "demo-mode": 403,
  "evcc-unreachable": 502,
};

function fail(code: AuthFailure, detail?: string): AuthResult {
  return { ok: false, status: FAILURE_STATUS[code], code, detail };
}

export const AUTH_MESSAGES: Record<AuthFailure, string> = {
  "login-required": "Bitte in evcc als Admin anmelden",
  "admin-password-missing": "In evcc ist kein Admin-Passwort gesetzt",
  "demo-mode": "evcc läuft im Demo-Modus",
  "evcc-unreachable": "evcc ist nicht erreichbar",
};

/** Ist ein Origin-Header gesetzt, muss sein Host zum Host der Anfrage passen */
export function checkOrigin(req: Pick<IncomingMessage, "headers">): void {
  const origin = req.headers.origin;
  if (origin === undefined) return;
  if (hostOf(origin) !== req.headers.host) {
    throw new AddonError("origin-mismatch", `Origin ${origin} passt nicht zu ${req.headers.host}`);
  }
}

/** Host einer Origin; ungültige Werte (z. B. "null") ergeben null und damit keine Übereinstimmung */
function hostOf(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

/** Wirft den passenden AddonError, wenn die Anfrage nicht von einem angemeldeten Admin stammt */
export async function requireAdmin(req: IncomingMessage, evccUrl: string): Promise<void> {
  checkOrigin(req);
  const result = await checkAdmin(req, evccUrl);
  if (!result.ok) {
    const message = AUTH_MESSAGES[result.code] + (result.detail ? ` (${result.detail})` : "");
    throw new AddonError(result.code, message);
  }
}
