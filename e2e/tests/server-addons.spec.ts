import { expect, test, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { repoPath, resetAddons } from "../helpers/addons.js";
import { installViaUi, loginViaUi } from "../helpers/login.js";

const SERVER_ZIP = repoPath("e2e/.build/server-addon-0.1.0.zip");
const BROKEN_ZIP = repoPath("e2e/.build/broken-server-addon-0.1.0.zip");
const EXT = "/addons-api/ext/server-addon";

// Die Server-Addons stehen nicht in seed.json; resetAddons entfernt sie per CLI samt addon-data/
test.beforeEach(() => resetAddons());

/** Anmelden und die ZIP über „Marketplace“ hochladen */
async function install(page: Page, file: string): Promise<void> {
  await loginViaUi(page);
  await installViaUi(page, file);
}

async function toggle(page: Page): Promise<void> {
  const reloaded = page.waitForEvent("load");
  await page.getByTestId("addon-card-server-addon").getByTestId("addon-toggle").click();
  await reloaded;
  await expect(page.getByTestId("addons-new")).toBeVisible();
}

test("der Server-Teil antwortet und folgt Deaktivieren und Aktivieren", async ({
  page,
  request,
}) => {
  await install(page, SERVER_ZIP);
  const echo = await request.get(`${EXT}/echo`);
  expect(echo.status()).toBe(200);
  expect(await echo.json()).toEqual({ echo: "server-addon" });
  await toggle(page);
  expect((await request.get(`${EXT}/echo`)).status()).toBe(404);
  await toggle(page);
  expect((await request.get(`${EXT}/echo`)).status()).toBe(200);
});

test("eine Route mit auth.require verlangt den Admin-Login", async ({ page, request }) => {
  await install(page, SERVER_ZIP);
  expect((await request.get(`${EXT}/admin`)).status()).toBe(401);
  const res = await page.request.get(`${EXT}/admin`);
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ admin: true });
});

test("eine gespeicherte Einstellung wirkt ohne Neustart", async ({ page, request }) => {
  await install(page, SERVER_ZIP);
  expect(await (await request.get(`${EXT}/settings`)).json()).toEqual({ greeting: "hallo" });
  await page.getByTestId("addon-card-server-addon").getByTestId("addon-settings").click();
  const modal = page.getByTestId("addon-settings-modal");
  await modal.getByTestId("addon-setting-greeting").selectOption("servus");
  await modal.getByTestId("addon-settings-save").click();
  await expect(modal).toHaveCount(0);
  expect(await (await request.get(`${EXT}/settings`)).json()).toEqual({ greeting: "servus" });
});

test("ein Fehler im Server-Teil erscheint auf der Karte", async ({ page, request }) => {
  await install(page, BROKEN_ZIP);
  await expect(
    page.getByTestId("addon-card-broken-server-addon").getByTestId("addon-error"),
  ).toHaveText("⚠ Fehler beim Start: Server-Teil: kaputt");
  expect((await request.get("/addons-api/ext/broken-server-addon/echo")).status()).toBe(404);
  expect((await request.get("/addons-api/health")).status()).toBe(200);
});

test("Deinstallieren weist auf gespeicherte Daten hin und löscht sie", async ({ page }) => {
  await install(page, SERVER_ZIP);
  expect(await (await page.request.get(`${EXT}/data`)).json()).toEqual({ visits: 1 });
  const dataDir = repoPath("e2e/.data/addon-data/server-addon");
  expect(existsSync(dataDir)).toBe(true);
  await page.reload();
  await expect(page.getByTestId("addons-new")).toBeVisible();

  let message = "";
  page.once("dialog", (dialog) => {
    message = dialog.message();
    void dialog.accept();
  });
  const reloaded = page.waitForEvent("load");
  await page.getByTestId("addon-card-server-addon").getByTestId("addon-uninstall").click();
  await reloaded;
  expect(message).toBe(
    "Server-Addon wirklich deinstallieren? Gespeicherte Daten des Addons werden gelöscht.",
  );
  await expect(page.getByTestId("addon-card-server-addon")).toHaveCount(0);
  expect(existsSync(dataDir)).toBe(false);
});
