// Client für die Verwaltungs-API des Proxys (/addons-api)
import type { Localized, SettingDef, SettingValues } from "@evcc-addons/sdk";
import { evccApi, pageBase } from "./evcc-api.js";

export interface AddonInfo {
  id: string;
  name: Localized;
  version: string;
  description: Localized | null;
  entry: string;
  enabled: boolean;
  error: string | null;
  /** Schema aus addon.json, sonst [] */
  settings: SettingDef[];
  /** Werte, mit Defaults aufgelöst */
  settingValues: SettingValues;
}

export class ApiError extends Error {
  override name = "ApiError";

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function addonsApiUrl(path: string): string {
  return new URL("addons-api/" + path.replace(/^\/+/, ""), pageBase()).href;
}

/** Fetch mit einheitlicher Fehlerbehandlung (`{ error: { code, message } }`) */
export async function request(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(addonsApiUrl(path), init);
  } catch (err) {
    throw new ApiError(0, "network", `Addon-Proxy nicht erreichbar: ${(err as Error).message}`);
  }
  if (!res.ok) throw await toApiError(res);
  return res;
}

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    return new ApiError(
      res.status,
      body.error?.code ?? "unknown",
      body.error?.message ?? res.statusText,
    );
  } catch {
    return new ApiError(res.status, "unknown", `HTTP ${res.status} ${res.statusText}`);
  }
}

export async function listAddons(): Promise<AddonInfo[]> {
  const res = await request("addons");
  return (await res.json()) as AddonInfo[];
}

export async function reportStatus(id: string, ok: boolean, message?: string): Promise<void> {
  await request(`addons/${encodeURIComponent(id)}/status`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ok, message }),
  });
}

export type SessionReason =
  "login-required" | "admin-password-missing" | "demo-mode" | "evcc-unreachable";

export interface Session {
  canManage: boolean;
  reason: SessionReason | null;
}

export interface InstallResponse {
  addon: AddonInfo;
  previousVersion: string | null;
}

export async function getSession(): Promise<Session> {
  const res = await request("session");
  return (await res.json()) as Session;
}

export async function installAddon(file: Blob): Promise<InstallResponse> {
  const res = await request("addons", {
    method: "PUT",
    headers: { "content-type": "application/zip" },
    body: file,
  });
  return (await res.json()) as InstallResponse;
}

export async function setAddonEnabled(id: string, enabled: boolean): Promise<AddonInfo> {
  const res = await request(`addons/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  return (await res.json()) as AddonInfo;
}

export async function saveAddonSettings(id: string, values: SettingValues): Promise<AddonInfo> {
  const res = await request(`addons/${encodeURIComponent(id)}/settings`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ values }),
  });
  return (await res.json()) as AddonInfo;
}

export async function uninstallAddon(id: string): Promise<void> {
  await request(`addons/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** Anmeldung über den (weitergeleiteten) evcc-Endpunkt; setzt den evcc-Cookie */
export async function login(password: string): Promise<void> {
  let res: Response;
  try {
    res = await evccApi("auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
  } catch (err) {
    throw new ApiError(0, "network", `evcc nicht erreichbar: ${(err as Error).message}`);
  }
  if (res.status === 401) throw new ApiError(401, "wrong-password", "Passwort falsch");
  if (!res.ok) throw new ApiError(res.status, "login-failed", (await res.text()) || res.statusText);
}

/** Alle Aufrufe der Seite „Addons“, austauschbar für Tests */
export interface ManagerClient {
  listAddons: () => Promise<AddonInfo[]>;
  getSession: () => Promise<Session>;
  installAddon: (file: Blob) => Promise<InstallResponse>;
  setAddonEnabled: (id: string, enabled: boolean) => Promise<AddonInfo>;
  saveAddonSettings: (id: string, values: SettingValues) => Promise<AddonInfo>;
  uninstallAddon: (id: string) => Promise<void>;
  login: (password: string) => Promise<void>;
}

export const managerClient: ManagerClient = {
  listAddons,
  getSession,
  installAddon,
  setAddonEnabled,
  saveAddonSettings,
  uninstallAddon,
  login,
};
