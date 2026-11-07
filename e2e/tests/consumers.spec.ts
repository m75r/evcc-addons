import { expect, test, type Page } from "@playwright/test";
import { repoPath, resetAddons } from "../helpers/addons.js";
import { openEvcc, openMoreMenu } from "../helpers/evcc.js";
import { loginViaUi, uploadZip } from "../helpers/login.js";

test.beforeEach(async ({ page }) => {
  resetAddons();
  await loginViaUi(page);
  const reloaded = page.waitForEvent("load");
  await uploadZip(page, repoPath("dist/addons/consumers-1.1.0.zip"));
  await expect(page.getByTestId("addons-install-success")).toHaveText(
    "Installiert: Verbraucher 1.1.0",
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

test("„Verbraucht anzeigen“ und Sortierung lassen sich auf der Seite „Addons“ einstellen", async ({
  page,
}) => {
  const addonCard = page.getByTestId("addon-card-consumers");
  await expect(addonCard).toContainText(
    "Zeigt Steckdosen und Verbraucher-Meter aus evcc mit Leistung und Energie live an. Steckdosen lassen sich direkt einschalten, ausschalten oder auf Smart stellen.",
  );
  await addonCard.getByTestId("addon-settings").click();
  const modal = page.getByTestId("addon-settings-modal");
  await expect(modal).toContainText("Einstellungen Verbraucher");
  await expect(modal).toContainText("Verbraucht anzeigen");
  await modal.getByTestId("addon-setting-showEnergy").uncheck();
  await modal.getByTestId("addon-setting-sort").selectOption("name-desc");
  await modal.getByTestId("addon-settings-save").click();
  await expect(modal).toHaveCount(0);

  await page.getByTestId("addon-tab-consumers-0").click();
  const socket = page.getByTestId("consumer-switch-1");
  await expect(socket.getByTestId("consumer-power")).toHaveText("150 W");
  await expect(socket.getByTestId("consumer-charged")).toHaveCount(0);
  // Kühlschrank liefert „Verbraucht“ (57,5 kWh); mit ausgeschalteter Einstellung fehlt die Zeile
  const fridge = page.getByTestId("consumer-meter-kuehlschrank");
  await expect(fridge.getByTestId("consumer-power")).toHaveText("120 W");
  await expect(fridge.getByTestId("consumer-consumed")).toHaveCount(0);
  const measured = page.getByTestId("consumers-measured").locator(":scope > [data-testid]");
  await expect(measured).toHaveCount(2);
  expect(
    await measured.evaluateAll((els) => els.map((el) => el.getAttribute("data-testid"))),
  ).toEqual(["consumer-meter-kuehlschrank", "consumer-meter-heizstab"]);
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
  const power = modes.getByTestId("consumer-mode-power");
  const smart = modes.getByTestId("consumer-mode-smart");
  await expect(power).toHaveAttribute("aria-pressed", "false");

  // ⏻: off → now → off
  await power.click();
  await expect(power).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => mode(page, 1)).toBe("now");
  await power.click();
  await expect(power).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => mode(page, 1)).toBe("off");

  // ☀: off → smart → off
  await smart.click();
  await expect(smart).toHaveAttribute("aria-pressed", "true");
  await expect(power).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => mode(page, 1)).toBe("smart");
  await smart.click();
  await expect(smart).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => mode(page, 1)).toBe("off");
});

test("die Modus-Gruppe steht im Kartenkopf rechts vom Titel", async ({ page }) => {
  await openEvcc(page, "#/addons/consumers");
  const card = page.getByTestId("consumer-switch-1");
  const title = await card.getByTestId("consumer-title").boundingBox();
  const group = await card.getByTestId("consumer-mode-1").boundingBox();
  expect(title).not.toBeNull();
  expect(group).not.toBeNull();
  if (!title || !group) return;
  expect(group.x).toBeGreaterThan(title.x + title.width - 1);
  // gleiche Zeile: die vertikalen Mitten liegen nah beieinander
  expect(Math.abs(group.y + group.height / 2 - (title.y + title.height / 2))).toBeLessThan(8);
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
