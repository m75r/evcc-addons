import { expect, test } from "@playwright/test";
import { resetAddons } from "../helpers/addons.js";
import { openEvcc, openMoreMenu } from "../helpers/evcc.js";

test.beforeEach(() => resetAddons());

test.describe("Desktop (1280 px)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("„Test-Tab“ öffnet die Addon-Seite mit Live-Daten", async ({ page }) => {
    await openEvcc(page);
    const tab = page.getByTestId("addon-tab-test-addon-0");
    await expect(tab).toBeVisible();
    await expect(tab).toHaveText("Test-Tab");
    await tab.click();
    await expect(page).toHaveURL(/#\/addons\/test-addon$/);
    const pv = page.getByTestId("test-addon-pv");
    await expect(pv).toHaveText("PV: 4321 W");
    await expect(pv).toBeInViewport();
    await expect(page.locator("#evcc-addons-page h1")).toHaveText("Test-Addon");
    await expect(page).toHaveTitle("Test-Addon | evcc");
    await expect(tab).toHaveClass(/active/);
    await expect(page.getByTestId("tab-more")).toHaveCSS("color", await grayColor(page));

    await page.getByTestId("tab-vorhersage").click();
    await expect(page).toHaveURL(/#\/forecast$/);
    await expect(page.locator("#evcc-addons-page")).toBeHidden();
    await expect(tab).not.toHaveClass(/active/);
    await expect(page).not.toHaveTitle(/Test-Addon/);
  });

  test("Menüeinträge öffnen Unterseite und Hello-Seite", async ({ page }) => {
    await openEvcc(page);
    await openMoreMenu(page);
    await page.getByTestId("addon-menu-test-addon-0").click();
    await expect(page).toHaveURL(/#\/addons\/test-addon\/detail$/);
    await expect(page.getByTestId("test-addon-detail")).toBeVisible();

    await openMoreMenu(page);
    await page.locator(".more-menu").getByText("Hallo", { exact: true }).click();
    await expect(page).toHaveURL(/#\/addons\/hello$/);
    await expect(page.getByTestId("hello-pv")).toHaveText("PV-Leistung: 4321 W");
  });

  test("#/addons listet die Addons und zeigt Startfehler", async ({ page }) => {
    await openEvcc(page, "#/addons");
    await expect(page.locator('[data-testid^="addon-card-"]')).toHaveCount(3);
    await expect(page.getByTestId("addon-card-broken-addon").getByTestId("addon-error")).toHaveText(
      "⚠ Fehler beim Start: Error: kaputt",
    );
    await expect(page.getByTestId("addon-card-test-addon").getByTestId("addon-error")).toHaveCount(
      0,
    );
  });

  test("die evcc-Startseite funktioniert weiterhin", async ({ page }) => {
    await openEvcc(page);
    await expect(page.getByText("Carport").first()).toBeVisible();
    await expect(page.locator("#evcc-addons-page")).toBeHidden();
  });
});

test.describe("Handy (375 px)", () => {
  test.use({ viewport: { width: 375, height: 740 } });

  test("der Tab steht im Menü „Mehr“", async ({ page }) => {
    await openEvcc(page);
    await expect(page.getByTestId("addon-tab-test-addon-0")).toBeHidden();
    await openMoreMenu(page);
    const mirror = page.getByTestId("addon-tab-test-addon-0-more");
    await expect(mirror).toBeVisible();
    await expect(mirror).toHaveText("Test-Tab");
    await mirror.click();
    await expect(page.getByTestId("test-addon-pv")).toHaveText("PV: 4321 W");
  });
});

/** Farbe eines nicht aktiven evcc-Tabs (zum Vergleich mit „Mehr“) */
async function grayColor(page: import("@playwright/test").Page): Promise<string> {
  return page.getByTestId("tab-vorhersage").evaluate((el) => getComputedStyle(el).color);
}
