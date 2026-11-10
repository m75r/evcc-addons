import { expect, test, type Locator, type Page } from "@playwright/test";
import { repoPath, resetAddons } from "../helpers/addons.js";
import { openEvcc, openMoreMenu } from "../helpers/evcc.js";
import { loginViaUi, uploadZip as uploadFile } from "../helpers/login.js";

test.beforeEach(() => resetAddons());

function uploadZip(page: Page, relativePath: string): Promise<void> {
  return uploadFile(page, repoPath(relativePath));
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
  await expect(page.getByTestId("addon-card-menu-addon").getByTestId("addon-toggle")).toBeEnabled();
  await openMoreMenu(page);
  await expect(page.locator(".more-menu").getByText("Abmelden", { exact: true })).toBeVisible();
});

/** Rahmenfarbe des Elements gleich der berechneten Farbe von --evcc-gray-50 */
function borderMatchesGray(locator: Locator): Promise<boolean> {
  return locator.evaluate((el) => {
    const probe = document.createElement("span");
    probe.style.color = "var(--evcc-gray-50)";
    document.body.append(probe);
    const gray = getComputedStyle(probe).color;
    probe.remove();
    return getComputedStyle(el).borderTopColor === gray;
  });
}

test("„+ Neu“ öffnet das Modal, ⇪ blendet den Upload ein und wieder aus, Untertitel bleibt", async ({
  page,
}) => {
  await loginViaUi(page);
  const subtitle = page.getByTestId("addons-subtitle");
  const install = page.getByTestId("addons-install");
  const button = page.getByTestId("addons-new");
  await expect(subtitle).toContainText("Addons erweitern evcc");
  await expect(install).toHaveCount(0);
  const heading = page.locator("#evcc-addons-page h1");
  // Layout und Schriften können nach dem Neuladen noch nachziehen, daher per Poll
  await expect
    .poll(async () => {
      const [title, box] = await Promise.all([heading.boundingBox(), button.boundingBox()]);
      return !!title && !!box && box.x > title.x + title.width - 1;
    })
    .toBe(true);
  // Stil wie evcc NewDeviceButton (Konfiguration): Radius 1rem, Rahmen in --evcc-gray-50.
  // Maus wegbewegen, damit kein Hover (Rahmen in Textfarbe) das Ergebnis verfälscht.
  await page.mouse.move(0, 0);
  await expect(button).toHaveCSS("border-top-left-radius", "16px");
  await expect.poll(() => borderMatchesGray(button)).toBe(true);

  await button.click();
  const modal = page.getByTestId("catalog-modal");
  await expect(modal).toBeVisible();
  await expect(subtitle).toBeVisible();
  await expect(install).toHaveCount(0);
  const toggle = modal.getByTestId("catalog-upload");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(modal.getByTestId("addons-install")).toBeVisible();
  await toggle.click();
  await expect(install).toHaveCount(0);
  await modal.getByTestId("catalog-close").click();
  await expect(modal).toHaveCount(0);
  await expect(subtitle).toBeVisible();
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
  await uploadZip(page, "e2e/.build/menu-addon-0.1.0.zip");
  await expect(page.getByTestId("addons-install-success")).toHaveText(
    "Neu installiert: Menü-Addon 0.1.0",
  );
  await reloaded;
});

test("Deaktivieren entfernt den Tab, Aktivieren bringt ihn zurück", async ({ page }) => {
  await loginViaUi(page);
  const toggle = page.getByTestId("addon-card-test-addon").getByTestId("addon-toggle");
  let reloaded = page.waitForEvent("load");
  await toggle.click();
  await reloaded;
  await expect(page.getByTestId("addons-new")).toBeVisible();
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
  await expect(page.getByTestId("addon-card-menu-addon")).toBeVisible();
  await expect(page.getByTestId("addon-card-broken-addon")).toHaveCount(0);
});

test("ein Zip-Slip-Paket wird mit Meldung abgelehnt", async ({ page }) => {
  await loginViaUi(page);
  await uploadZip(page, "e2e/.build/zip-slip.zip");
  await expect(page.getByTestId("addons-install-error")).toHaveText(
    "Das Paket enthält unzulässige Dateipfade.",
  );
});

async function logoutAndOpenAddons(page: Page): Promise<void> {
  await openMoreMenu(page);
  await page.locator(".more-menu").getByText("Abmelden", { exact: true }).click();
  await page.getByTestId("tab-laden").click();
  await openMoreMenu(page);
  await page.getByTestId("addons-more-item").click();
}

test("nach dem Abmelden in evcc erscheint wieder das Anmeldefeld", async ({ page }) => {
  await loginViaUi(page);
  await logoutAndOpenAddons(page);
  await expect(page.getByTestId("addons-login")).toBeVisible();
  await expect(page.getByTestId("addons-install")).toHaveCount(0);
});

test("Einstellungen speichern ohne Neuladen", async ({ page }) => {
  await loginViaUi(page);
  const card = page.getByTestId("addon-card-test-addon");
  await expect(page.getByTestId("addon-card-menu-addon").getByTestId("addon-settings")).toHaveCount(
    0,
  );
  await card.getByTestId("addon-settings").click();
  const modal = page.getByTestId("addon-settings-modal");
  await expect(modal).toContainText("Einstellungen Test-Addon");
  const showPv = modal.getByTestId("addon-setting-showPv");
  await expect(showPv).toBeChecked();
  await showPv.uncheck();
  await page.evaluate(() => ((window as { __noReload?: boolean }).__noReload = true));
  await modal.getByTestId("addon-settings-save").click();
  await expect(modal).toHaveCount(0);
  expect(await page.evaluate(() => (window as { __noReload?: boolean }).__noReload)).toBe(true);

  await page.getByTestId("addon-tab-test-addon-0").click();
  await expect(page.getByTestId("test-addon-setting")).toHaveText("showPv: false");
  await page.reload();
  await expect(page.getByTestId("test-addon-setting")).toHaveText("showPv: false");

  await logoutAndOpenAddons(page);
  await card.getByTestId("addon-settings").click();
  await expect(modal.getByTestId("addon-settings-readonly")).toHaveText(
    "Zum Ändern in evcc anmelden.",
  );
  await expect(modal.getByTestId("addon-setting-showPv")).toBeDisabled();
  await expect(modal.getByTestId("addon-setting-showPv")).not.toBeChecked();
  await expect(modal.getByTestId("addon-settings-save")).toHaveCount(0);
});

test("neben dem Titel steht die Version", async ({ page, request }) => {
  const health = (await (await request.get("/addons-api/health")).json()) as { version: string };
  await openEvcc(page, "#/addons");
  const version = page.getByTestId("addons-version");
  await expect(version).toHaveText(`v${health.version}`);
  // klein und mit kleinem „v“ wie die Version auf den Addon-Karten, nicht in Großbuchstaben des h1
  await expect(version).toHaveCSS("text-transform", "none");
  await expect(version).toHaveCSS("font-size", "14px");
});
