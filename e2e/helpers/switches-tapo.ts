// Installiert switches-tapo mit den Steckdosen aus e2e/fixtures: „Lampe“ (Ladepunkt, Fake-Tapo 17090) und,
// in switches-v2.json, „kaffee“ (Verbraucher, Fake-Tapo 17091).
// Läuft im beforeAll jedes Specs, das das Gateway braucht: resetAddons() in anderen Specs löscht addon-data/.
import { expect, request } from "@playwright/test";
import { chmodSync, copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { repoPath } from "./addons.js";
import { ADMIN_PASSWORD } from "./evcc.js";

export const SWITCHES_TAPO_ZIP = "dist/addons/switches-tapo-1.0.0.zip";
const BASE_URL = "http://localhost:17080";

/** Datei aus e2e/fixtures als switches.json des Addons, Rechte wie im Betrieb */
function seedSwitches(fixture: string): void {
  const dir = repoPath("e2e/.data/addon-data/switches-tapo");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const target = `${dir}/switches.json`;
  copyFileSync(repoPath(`e2e/fixtures/${fixture}`), target);
  chmodSync(target, 0o600);
}

/** Legt switches.json ab und lädt die ZIP angemeldet über die API hoch (der Server-Teil startet dabei) */
export async function installSwitchesTapo(fixture = "switches-v2.json"): Promise<void> {
  seedSwitches(fixture);
  const api = await request.newContext({ baseURL: BASE_URL });
  try {
    const login = await api.post("/api/auth/login", { data: { password: ADMIN_PASSWORD } });
    expect(login.ok()).toBe(true);
    const res = await api.put("/addons-api/addons", {
      headers: { "content-type": "application/zip" },
      data: readFileSync(repoPath(SWITCHES_TAPO_ZIP)),
    });
    expect(res.status()).toBe(201);
  } finally {
    await api.dispose();
  }
}
