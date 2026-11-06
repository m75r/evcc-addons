import { expect, test, type Page } from "@playwright/test";
import { repoPath, resetAddons } from "../helpers/addons.js";
import { openEvcc, openMoreMenu } from "../helpers/evcc.js";
import { loginViaUi } from "../helpers/login.js";

test.beforeEach(() => resetAddons());

async function uploadZip(page: Page, relativePath: string): Promise<void> {
  await page.getByTestId("addons-install-file").setInputFiles(repoPath(relativePath));
  await page
    .getByTestId("addons-install")
    .getByRole("button", { name: "Installieren", exact: true })
    .click();
}

test("ohne Login erscheint das Anmeldefeld, mit Passwort die Verwaltung", async ({ page }) => {
  await openEvcc(page, "#/addons");
  const form = page.getByTestId("addons-login");
  await expect(form).toBeVisible();
  await expect(page.getByTestId("addons-install")).toHaveCount(0);
  await form.locator('input[type="password"]').fill("falsch");
  await form.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByTestId("addons-login-error")).toHaveText("Passwort falsch");

  await loginViaUi(page);
  await expect(page.getByTestId("addon-card-hello").getByTestId("addon-toggle")).toBeEnabled();
  await openMoreMenu(page);
  await expect(page.locator(".more-menu").getByText("Abmelden", { exact: true })).toBeVisible();
});

test("Update und Neuinstallation melden die Versionen", async ({ page }) => {
  await loginViaUi(page);
  let reloaded = page.waitForEvent("load");
  await uploadZip(page, "e2e/.build/test-addon-0.2.0.zip");
  await expect(page.getByTestId("addons-install-success")).toHaveText(
    "Aktualisiert von 0.1.0 auf 0.2.0",
  );
  await reloaded;
  await expect(page.getByTestId("addon-card-test-addon")).toContainText("v0.2.0");

  reloaded = page.waitForEvent("load");
  await uploadZip(page, "dist/addons/hello-0.1.0.zip");
  await expect(page.getByTestId("addons-install-success")).toHaveText(
    "Neu installiert: Hallo Welt 0.1.0",
  );
  await reloaded;
});

test("Deaktivieren entfernt den Tab, Aktivieren bringt ihn zurück", async ({ page }) => {
  await loginViaUi(page);
  const toggle = page.getByTestId("addon-card-test-addon").getByTestId("addon-toggle");
  let reloaded = page.waitForEvent("load");
  await toggle.click();
  await reloaded;
  await expect(page.getByTestId("addons-install")).toBeVisible();
  await expect(toggle).not.toBeChecked();
  await expect(page.getByTestId("addon-tab-test-addon-0")).toHaveCount(0);

  reloaded = page.waitForEvent("load");
  await toggle.click();
  await reloaded;
  await expect(toggle).toBeChecked();
  await expect(page.getByTestId("addon-tab-test-addon-0")).toBeVisible();
});

test("Deinstallieren entfernt das Addon aus der Liste", async ({ page }) => {
  await loginViaUi(page);
  page.once("dialog", (dialog) => void dialog.accept());
  const reloaded = page.waitForEvent("load");
  await page.getByTestId("addon-card-broken-addon").getByTestId("addon-uninstall").click();
  await reloaded;
  await expect(page.getByTestId("addon-card-hello")).toBeVisible();
  await expect(page.getByTestId("addon-card-broken-addon")).toHaveCount(0);
});

test("ein Zip-Slip-Paket wird mit Meldung abgelehnt", async ({ page }) => {
  await loginViaUi(page);
  await uploadZip(page, "e2e/.build/zip-slip.zip");
  await expect(page.getByTestId("addons-install-error")).toHaveText(
    "Das Paket enthält unzulässige Dateipfade.",
  );
});

test("nach dem Abmelden in evcc erscheint wieder das Anmeldefeld", async ({ page }) => {
  await loginViaUi(page);
  await openMoreMenu(page);
  await page.locator(".more-menu").getByText("Abmelden", { exact: true }).click();
  await page.getByTestId("tab-laden").click();
  await openMoreMenu(page);
  await page.getByTestId("addons-more-item").click();
  await expect(page.getByTestId("addons-login")).toBeVisible();
  await expect(page.getByTestId("addons-install")).toHaveCount(0);
});
