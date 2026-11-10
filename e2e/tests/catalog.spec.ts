// Modal „Addon hinzufügen“ mit dem Fake-Katalog aus e2e/fake-catalog.mjs (Inhalt von seed.mjs)
import { expect, test, type Page } from "@playwright/test";
import { resetAddons } from "../helpers/addons.js";
import { loginViaUi } from "../helpers/login.js";

test.beforeEach(() => resetAddons());

async function openCatalog(page: Page) {
  await loginViaUi(page);
  await page.getByTestId("addons-new").click();
  const modal = page.getByTestId("catalog-modal");
  await expect(modal).toBeVisible();
  await expect(modal.getByTestId("catalog-loading")).toHaveCount(0);
  return modal;
}

test("„+ Neu“ zeigt den Katalog mit Zustand und Buttons je Eintrag", async ({ page }) => {
  const modal = await openCatalog(page);
  await expect(modal.locator(".modal-title")).toHaveText("Addon hinzufügen");
  await expect(modal.locator(".evcc-addons-catalog-entry")).toHaveCount(4);
  const expected = [
    ["test-addon", "Installiert: v0.1.0", "Aktualisieren"],
    ["menu-addon", "✓ Installiert", "Neu installieren"],
    ["server-addon", null, "Installieren"],
    ["future-addon", "Benötigt eine neuere Version von evcc-addons", null],
  ] as const;
  for (const [id, status, action] of expected) {
    const entry = modal.getByTestId(`catalog-entry-${id}`);
    if (status) await expect(entry.getByTestId("catalog-status")).toHaveText(status);
    else await expect(entry.getByTestId("catalog-status")).toHaveCount(0);
    if (action) await expect(entry.getByTestId("catalog-action")).toHaveText(action);
    else await expect(entry.getByTestId("catalog-action")).toHaveCount(0);
  }
});

test("„Aktualisieren“ lädt die neue Version aus dem Katalog", async ({ page }) => {
  const modal = await openCatalog(page);
  const entry = modal.getByTestId("catalog-entry-test-addon");
  const reloaded = page.waitForEvent("load");
  await entry.getByTestId("catalog-action").click();
  await expect(entry.getByTestId("catalog-success")).toHaveText("Aktualisiert von 0.1.0 auf 0.2.0");
  await reloaded;
  await expect(page.getByTestId("addon-card-test-addon")).toContainText("v0.2.0");
});

test("„Installieren“ fügt ein neues Addon hinzu", async ({ page }) => {
  const modal = await openCatalog(page);
  await expect(page.getByTestId("addon-card-server-addon")).toHaveCount(0);
  const reloaded = page.waitForEvent("load");
  await modal.getByTestId("catalog-entry-server-addon").getByTestId("catalog-action").click();
  await reloaded;
  await expect(page.getByTestId("addon-card-server-addon")).toBeVisible();
});

test("✕ und Escape schließen das Modal", async ({ page }) => {
  let modal = await openCatalog(page);
  await modal.getByTestId("catalog-close").click();
  await expect(modal).toHaveCount(0);
  await page.getByTestId("addons-new").click();
  modal = page.getByTestId("catalog-modal");
  await expect(modal).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
});
