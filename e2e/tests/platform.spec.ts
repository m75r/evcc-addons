// Version und Badge „Update verfügbar“ auf der Seite „Addons“ mit dem Release aus e2e/fake-catalog.mjs
import { expect, test, type Page } from "@playwright/test";
import { openEvcc } from "../helpers/evcc.js";
import { loginViaUi } from "../helpers/login.js";
import { runningVersion, setFakeRelease } from "../helpers/release.js";
import { SEED_RELEASE_TAG } from "../seed.mjs";

/** Anmelden, Release setzen und die Seite mit dem neuen Stand laden */
async function openWithRelease(page: Page, tag: string | null) {
  await loginViaUi(page);
  await setFakeRelease(page, tag);
  await page.reload();
  await expect(page.getByTestId("addons-new")).toBeVisible();
}

async function openPopup(page: Page) {
  await page.getByTestId("addons-version").click();
  const modal = page.getByTestId("platform-modal");
  await expect(modal).toBeVisible();
  await expect(modal.getByTestId("platform-checking")).toHaveCount(0);
  return modal;
}

test("ohne Login gibt es kein Badge", async ({ page }) => {
  await openEvcc(page, "#/addons");
  await expect(page.getByTestId("addons-login")).toBeVisible();
  await expect(page.getByTestId("addons-version")).toBeVisible();
  await expect(page.getByTestId("addons-update-badge")).toHaveCount(0);
});

test("Admins sehen „Update verfügbar“, das Popup zeigt den manuellen Weg", async ({ page }) => {
  await openWithRelease(page, SEED_RELEASE_TAG);
  const current = await runningVersion(page);
  const badge = page.getByTestId("addons-update-badge");
  await expect(badge).toHaveText("Update verfügbar");
  await badge.click();
  const modal = page.getByTestId("platform-modal");
  await expect(modal.locator(".modal-title")).toHaveText("evcc-addons aktualisieren");
  await expect(modal.getByTestId("platform-current")).toHaveText(`v${current}`);
  await expect(modal.getByTestId("platform-latest")).toHaveText("v99.0.0");
  await expect(modal.getByTestId("platform-notes")).toHaveAttribute("target", "_blank");
  await expect(modal.getByTestId("platform-download")).toBeVisible();
  await expect(modal.getByTestId("platform-command")).toHaveText(
    "sudo apt install ./evcc-addons_99.0.0_all.deb",
  );
  await expect(modal.getByTestId("platform-update")).toHaveCount(0);
});

test("„Jetzt prüfen“ zeigt nach einem Release der laufenden Version „ist aktuell“", async ({
  page,
}) => {
  await openWithRelease(page, SEED_RELEASE_TAG);
  const current = await runningVersion(page);
  const modal = await openPopup(page);
  await expect(modal.getByTestId("platform-manual")).toBeVisible();
  await setFakeRelease(page, `v${current}`);
  await modal.getByTestId("platform-check").click();
  await expect(modal.getByTestId("platform-up-to-date")).toHaveText(
    `evcc-addons ist aktuell (v${current}).`,
  );
  await expect(page.getByTestId("addons-update-badge")).toHaveCount(0);
  await modal.getByTestId("platform-close").click();
  await expect(modal).toHaveCount(0);
});

test("ohne Release zeigt das Popup über die Version den Prüffehler", async ({ page }) => {
  await openWithRelease(page, null);
  await expect(page.getByTestId("addons-update-badge")).toHaveCount(0);
  const modal = await openPopup(page);
  await expect(modal.getByTestId("platform-check-error")).toHaveText(
    "Prüfung fehlgeschlagen: GitHub ist nicht erreichbar (HTTP 404).",
  );
  await setFakeRelease(page, SEED_RELEASE_TAG);
});
