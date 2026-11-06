import { expect, test } from "@playwright/test";
import { resetAddons } from "../helpers/addons.js";
import { openEvcc, openMoreMenu } from "../helpers/evcc.js";

test.beforeEach(async ({ page }) => {
  resetAddons();
  await openEvcc(page);
});

test("„Addons“ steht im Menü „Mehr“ nach „Konfiguration“", async ({ page }) => {
  await openMoreMenu(page);
  const items = page.locator(".more-menu > .dropdown-item");
  const labels = (await items.allTextContents()).map((text) => text.trim());
  const configIndex = labels.indexOf("Konfiguration");
  expect(configIndex).toBeGreaterThanOrEqual(0);
  expect(labels[configIndex + 1]).toBe("Addons");
  await expect(page.getByTestId("addons-more-item")).toBeVisible();
});

test("„Addons“ öffnet die Seite, „Laden“ blendet sie wieder aus", async ({ page }) => {
  await openMoreMenu(page);
  await page.getByTestId("addons-more-item").click();
  await expect(page).toHaveURL(/#\/addons$/);
  const heading = page.locator("#evcc-addons-page h1");
  await expect(heading).toHaveText("Addons");
  await expect(heading).toBeInViewport();
  await expect(page.locator(".more-menu")).not.toHaveClass(/open/);
  await expect(page.getByTestId("addons-more-item")).toHaveClass(/active/);

  await page.getByTestId("tab-laden").click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.locator("#evcc-addons-page")).toBeHidden();
});

test("„Konfiguration“ öffnet weiterhin das evcc-Login", async ({ page }) => {
  await openMoreMenu(page);
  await page.locator('.more-menu a.dropdown-item[href="#/config"]').click();
  await expect(page.locator("#loginModal")).toBeVisible();
});
