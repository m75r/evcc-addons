import { expect, test } from "@playwright/test";
import { resetAddons } from "../helpers/addons.js";
import { openEvcc } from "../helpers/evcc.js";

test.beforeEach(() => resetAddons());

test("evcc lädt über den Proxy mit Live-Daten", async ({ page }) => {
  await openEvcc(page);
  await expect(page.getByText("Carport").first()).toBeVisible();
});

test("die Startseite enthält den Loader-Tag", async ({ request }) => {
  const res = await request.get("/", { headers: { "accept-encoding": "gzip" } });
  expect(res.ok()).toBe(true);
  expect(await res.text()).toMatch(
    /<script type="module" src="\.\/addons-static\/_core\/loader\.js\?v=[^"]+"><\/script>\s*<\/head>/,
  );
});
