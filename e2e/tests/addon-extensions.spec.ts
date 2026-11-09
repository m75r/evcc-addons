import { expect, test, type Page } from "@playwright/test";
import { repoPath, resetAddons } from "../helpers/addons.js";
import { openEvcc } from "../helpers/evcc.js";
import { installViaUi, loginViaUi } from "../helpers/login.js";

// Die Fixtures stehen nicht in seed.json, damit die Kartenanzahl anderer Specs gleich bleibt
test.beforeEach(() => resetAddons());

async function installBoth(page: Page): Promise<void> {
  await loginViaUi(page);
  await installViaUi(page, repoPath("e2e/.build/ext-consumer-0.1.0.zip"));
  await installViaUi(page, repoPath("e2e/.build/ext-provider-0.1.0.zip"));
}

async function openFixtureDialog(page: Page) {
  await page.getByTestId("addon-card-ext-provider").getByTestId("addon-dialog-0").click();
  const modal = page.getByTestId("addon-dialog-modal");
  await expect(modal.locator(".modal-title")).toHaveText("Fixture");
  return modal;
}

test("das Badge des Anbieters erscheint auf der Seite des Nutzers", async ({ page }) => {
  await installBoth(page);
  await openEvcc(page, "#/addons/ext-consumer");
  await expect(page.getByTestId("ext-badges").locator("li")).toHaveText([
    "ext-provider: Badge von ext-provider",
  ]);
});

test("der Dialog „Fixture“ zeigt das Echo des eigenen Server-Teils", async ({ page }) => {
  await installBoth(page);
  const button = page.getByTestId("addon-card-ext-provider").getByTestId("addon-dialog-0");
  await expect(button).toHaveAttribute("aria-label", "Fixture");
  const modal = await openFixtureDialog(page);
  await expect(modal.getByTestId("fixture-can-manage")).toHaveText("canManage=true");
  await expect(modal.getByTestId("fixture-echo")).toHaveText('{"echo":"ext-provider"}');
  await modal.getByTestId("addon-dialog-close").click();
  await expect(modal).toHaveCount(0);
});

test("ohne Login erhält der Dialog canManage=false", async ({ page }) => {
  await installBoth(page);
  await page.context().clearCookies();
  await page.reload();
  await expect(page.getByTestId("addons-login")).toBeVisible();
  const modal = await openFixtureDialog(page);
  await expect(modal.getByTestId("fixture-can-manage")).toHaveText("canManage=false");
  await expect(modal.getByTestId("fixture-echo")).toHaveText('{"echo":"ext-provider"}');
});
