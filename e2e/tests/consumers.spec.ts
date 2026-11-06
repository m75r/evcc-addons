import { expect, test, type Page } from "@playwright/test";
import { repoPath, resetAddons } from "../helpers/addons.js";
import { openEvcc, openMoreMenu } from "../helpers/evcc.js";
import { loginViaUi } from "../helpers/login.js";

test.beforeEach(async ({ page }) => {
  resetAddons();
  await loginViaUi(page);
  await page
    .getByTestId("addons-install-file")
    .setInputFiles(repoPath("dist/addons/consumers-1.0.3.zip"));
  const reloaded = page.waitForEvent("load");
  await page
    .getByTestId("addons-install")
    .getByRole("button", { name: "Installieren", exact: true })
    .click();
  await expect(page.getByTestId("addons-install-success")).toHaveText(
    "Installiert: Verbraucher 1.0.3",
  );
  await reloaded;
});

async function mode(page: Page, index: number): Promise<unknown> {
  const res = await page.request.get(`/api/state?jq=.loadpoints[${index}].mode`);
  return res.json();
}

test("Tab „Verbraucher“ zeigt schaltbare und gemessene Verbraucher", async ({ page }) => {
  await openEvcc(page);
  await page.getByTestId("addon-tab-consumers-0").click();
  await expect(page).toHaveURL(/#\/addons\/consumers$/);
  await expect(page.locator("#evcc-addons-page h1")).toHaveText("Verbraucher");
  await expect(page).toHaveTitle("Verbraucher | evcc");

  const socket = page.getByTestId("consumer-switch-1");
  await expect(socket).toContainText("Waschmaschine");
  await expect(socket.getByTestId("consumer-power")).toHaveText("150 W");
  await expect(page.getByTestId("consumer-switch-0")).toHaveCount(0);

  const fridge = page.getByTestId("consumer-meter-kuehlschrank");
  await expect(fridge.getByTestId("consumer-power")).toHaveText("120 W");
  await expect(fridge.getByTestId("consumer-consumed")).toHaveText("57,5 kWh");
  // Geräte-Icons wie in evcc (Standard: consumer „generic“, aux „smartconsumer“)
  await expect(fridge.locator('[data-testid="consumer-icon"] svg')).toBeVisible();
  await expect(socket.locator('[data-testid="consumer-icon"] svg')).toBeVisible();
  const heater = page.getByTestId("consumer-meter-heizstab");
  await expect(heater.locator('[data-testid="consumer-icon"] svg')).toBeVisible();
  await expect(heater.getByTestId("consumer-power")).toHaveText("1,5 kW");
  // wie evcc: ohne Energiewert des Geräts keine Zeile „Verbraucht“
  await expect(heater.getByTestId("consumer-consumed")).toHaveCount(0);
  await expect(page.getByTestId("consumers-login-hint")).toHaveCount(0);
  await expect(page.getByTestId("consumers-status-error")).toHaveCount(0);

  // Farben wie auf der evcc-Konfigurationsseite: Wert fett in Primärfarbe, Label in Textfarbe
  const style = await fridge.getByTestId("consumer-power").evaluate((el) => {
    const value = getComputedStyle(el);
    const label = getComputedStyle(el.previousElementSibling as Element);
    const primary = document.createElement("span");
    primary.style.color = "var(--bs-primary)";
    document.body.append(primary);
    const result = {
      value: value.color,
      weight: value.fontWeight,
      label: label.color,
      primary: getComputedStyle(primary).color,
    };
    primary.remove();
    return result;
  });
  expect(style.value).toBe(style.primary);
  expect(Number(style.weight)).toBeGreaterThanOrEqual(700);
  expect(style.label).not.toBe(style.primary);
});

test("ohne Login erscheint der Hinweis auf weitere Gerätewerte", async ({ page }) => {
  await openEvcc(page);
  await openMoreMenu(page);
  await page.locator(".more-menu").getByText("Abmelden", { exact: true }).click();
  await page.getByTestId("addon-tab-consumers-0").click();
  await expect(page.getByTestId("consumers-login-hint")).toBeVisible();
  await expect(
    page.getByTestId("consumer-meter-kuehlschrank").getByTestId("consumer-consumed"),
  ).toHaveText("57,5 kWh");
});

test("der Modus lässt sich umschalten", async ({ page }) => {
  await openEvcc(page, "#/addons/consumers");
  const modes = page.getByTestId("consumer-mode-1");
  const fast = modes.getByRole("button", { name: "Schnell" });
  await fast.click();
  await expect(fast).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => mode(page, 1)).toBe("now");

  const off = modes.getByRole("button", { name: "Aus" });
  await off.click();
  await expect(off).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => mode(page, 1)).toBe("off");
});

test.describe("Handy (375 px)", () => {
  test.use({ viewport: { width: 375, height: 740 } });

  test("„Verbraucher“ steht im Menü „Mehr“", async ({ page }) => {
    await openEvcc(page);
    await openMoreMenu(page);
    await page.getByTestId("addon-tab-consumers-0-more").click();
    await expect(page.getByTestId("consumer-switch-1")).toBeVisible();
  });
});

test("im Dark-Mode ist die Karte lesbar", async ({ page }) => {
  // evcc liest das Theme beim Laden aus dem localStorage; goto auf einen anderen Hash lädt nicht neu
  await openEvcc(page, "#/addons/consumers");
  await page.evaluate(() => window.localStorage.setItem("settings_theme", "dark"));
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  const card = page.getByTestId("consumer-meter-kuehlschrank");
  await expect(card).toBeVisible();
  const colors = await card.evaluate((el) => {
    const style = getComputedStyle(el);
    return { background: style.backgroundColor, color: style.color };
  });
  expect(colors.background).not.toBe(colors.color);
  expect(colors.background).not.toBe("rgba(0, 0, 0, 0)");
});
