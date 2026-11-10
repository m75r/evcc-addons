// Playwright-Helfer für E2E-Tests mit echtem evcc (Docker) hinter dem Proxy
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EVCC_PORT, PROXY_PORT } from "./server.js";

export const ADMIN_PASSWORD = "e2e-secret";
export const PROXY_URL = `http://localhost:${PROXY_PORT}`;

/** packages/sdk bzw. das Paket im node_modules eines Addon-Repos */
const SDK_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** Setzt das evcc-Admin-Passwort, falls noch keins gesetzt ist (wie auf dem Pi) */
export async function setAdminPassword(request: APIRequestContext): Promise<void> {
  const status = await request.get("/api/auth/status");
  if (status.status() !== 501) return;
  const res = await request.put("/api/auth/password", {
    data: { current: "", new: ADMIN_PASSWORD },
  });
  expect(res.ok()).toBe(true);
}

/** Öffnet eine Seite und wartet, bis evcc Live-Daten anzeigt */
export async function openEvcc(page: Page, hash = "#/"): Promise<void> {
  await page.goto("/" + hash);
  await expect(page.getByTestId("bottom-tab-bar")).toBeVisible();
  await expect(page.getByTestId("bottom-tab-bar")).not.toHaveClass(/bottom-tab-bar--hidden/);
}

export async function openMoreMenu(page: Page): Promise<void> {
  await page.getByTestId("tab-more").click();
  await expect(page.locator(".more-menu")).toHaveClass(/open/);
}

/** Anmeldung über das Feld der Seite „Addons“ (setzt den evcc-Cookie, danach Neuladen) */
export async function login(page: Page, password = ADMIN_PASSWORD): Promise<void> {
  await openEvcc(page, "#/addons");
  const form = page.getByTestId("addons-login");
  await form.locator('input[type="password"]').fill(password);
  const reloaded = page.waitForEvent("load");
  await form.getByRole("button", { name: "Anmelden" }).click();
  await reloaded;
  await expect(page.getByTestId("addons-new")).toBeVisible();
}

/**
 * Öffnet über „+ Neu“ das Modal „Addon hinzufügen“, blendet mit [⇪] „Aus Datei installieren“ ein
 * und lädt die ZIP hoch (ab SDK 2.1.0; vorher stand das Formular direkt auf der Seite)
 */
export async function uploadZip(page: Page, file: string): Promise<void> {
  await page.getByTestId("addons-new").click();
  await expect(page.getByTestId("catalog-modal")).toBeVisible();
  await page.getByTestId("catalog-upload").click();
  await page.getByTestId("addons-install-file").setInputFiles(file);
  await page
    .getByTestId("addons-install")
    .getByRole("button", { name: "Installieren", exact: true })
    .click();
}

/** Lädt die ZIP angemeldet über das Modal hoch (`uploadZip`) und wartet auf das Neuladen der Seite */
export async function installViaUi(page: Page, file: string): Promise<void> {
  const reloaded = page.waitForEvent("load");
  await uploadZip(page, file);
  await reloaded;
  await expect(page.getByTestId("addons-new")).toBeVisible();
}

/** Wie Playwrights `webServer`-Einträge (ohne Abhängigkeit vom Typ der Konfiguration) */
export interface E2eWebServer {
  command: string;
  cwd?: string;
  url: string;
  timeout?: number;
  reuseExistingServer?: boolean;
  env?: Record<string, string>;
  gracefulShutdown?: { signal: "SIGINT" | "SIGTERM"; timeout: number };
  stdout?: "pipe" | "ignore";
  stderr?: "pipe" | "ignore";
}

export interface E2eOptions {
  /** Wurzel des Repos (absolut) */
  root: string;
  /** evcc.yaml, relativ zu `root` oder absolut */
  evccConfig: string;
  /** Addon-ZIPs, die vor jedem Start installiert sind (relativ zu `root`) */
  zips?: string[];
  /** Node-Skript (relativ zu `root`), das vor dem Proxy läuft, z. B. zum Bauen von Fixtures */
  prepare?: string;
  /** Weitere Server, z. B. Fake-Geräte; sie starten vor dem Proxy */
  extra?: E2eWebServer[];
  /** Listing-URL des Katalogs (`catalogUrl` des Proxys); Standard: unerreichbar, kein Zugriff auf GitHub */
  catalogUrl?: string;
  /** Release-API der Plattform (`releaseUrl` des Proxys); Standard: unerreichbar, kein Zugriff auf GitHub */
  releaseUrl?: string;
}

function stringEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}

function evccServer(opts: E2eOptions): E2eWebServer {
  const config = isAbsolute(opts.evccConfig)
    ? opts.evccConfig
    : resolve(opts.root, opts.evccConfig);
  return {
    command: `docker compose -f "${resolve(SDK_ROOT, "testing/compose.yml")}" up --force-recreate`,
    cwd: opts.root,
    url: `http://127.0.0.1:${EVCC_PORT}`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: { ...stringEnv(), EVCC_CONFIG: config },
    gracefulShutdown: { signal: "SIGINT", timeout: 15_000 },
    stdout: "ignore",
    stderr: "pipe",
  };
}

function proxyServer(opts: E2eOptions): E2eWebServer {
  const script = resolve(dirname(fileURLToPath(import.meta.url)), "start-proxy.js");
  const env = {
    ...stringEnv(),
    EVCC_ADDONS_TEST_ROOT: opts.root,
    EVCC_ADDONS_TEST_ZIPS: JSON.stringify(opts.zips ?? []),
    ...(opts.prepare ? { EVCC_ADDONS_TEST_PREPARE: opts.prepare } : {}),
    ...(opts.catalogUrl ? { EVCC_ADDONS_TEST_CATALOG_URL: opts.catalogUrl } : {}),
    ...(opts.releaseUrl ? { EVCC_ADDONS_TEST_RELEASE_URL: opts.releaseUrl } : {}),
  };
  return {
    command: `node "${script}"`,
    cwd: opts.root,
    url: `http://127.0.0.1:${PROXY_PORT}/addons-api/health`,
    timeout: 60_000,
    reuseExistingServer: false,
    env,
    stdout: "pipe",
    stderr: "pipe",
  };
}

/** Webserver für `playwright.config.ts`: evcc (Docker), `extra`, dann der Proxy mit den Seed-Addons */
export function e2eWebServers(opts: E2eOptions): E2eWebServer[] {
  return [evccServer(opts), ...(opts.extra ?? []), proxyServer(opts)];
}
