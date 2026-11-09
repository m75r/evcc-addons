import { expect, test, type Page } from "@playwright/test";
import { repoPath, resetAddons } from "../helpers/addons.js";
import { openEvcc, openMoreMenu } from "../helpers/evcc.js";
import { loginViaUi, uploadZip } from "../helpers/login.js";
import { installSwitchesTapo } from "../helpers/switches-tapo.js";

/** Ladepunkt „Lampe“ (Index 2) ist an die Tapo-Steckdose `lampe` von switches-tapo gebunden */
const LAMP = 2;
/** Fake-Tapo der Steckdose „kaffee“ (Verbraucher-Bindung in switches-v2.json) */
const COFFEE_TAPO = "http://127.0.0.1:17091";
const COFFEE_STATE =
  "/addons-api/ext/switches-tapo/kaffee/c0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ff/state";

test.beforeEach(async ({ page }) => {
  resetAddons();
  await loginViaUi(page);
  const reloaded = page.waitForEvent("load");
  await uploadZip(page, repoPath("dist/addons/consumers-2.0.0.zip"));
  await expect(page.getByTestId("addons-install-success")).toHaveText(
    "Installiert: Verbraucher 2.0.0",
  );
  await reloaded;
});

async function mode(page: Page, index: number): Promise<unknown> {
  const res = await page.request.get(`/api/state?jq=.loadpoints[${index}].mode`);
  return res.json();
}

test("Tab „Verbraucher“ zeigt ohne Steckdosen-Addon alle Karten unter „Nur Messung“", async ({
  page,
}) => {
  await openEvcc(page);
  await page.getByTestId("addon-tab-consumers-0").click();
  await expect(page).toHaveURL(/#\/addons\/consumers$/);
  await expect(page.locator("#evcc-addons-page h1")).toHaveText("Verbraucher");
  await expect(page).toHaveTitle("Verbraucher | evcc");

  const measured = page.getByTestId("consumers-measured");
  const socket = measured.getByTestId("consumer-switch-1");
  await expect(socket).toContainText("Waschmaschine");
  await expect(socket.getByTestId("consumer-power")).toHaveText("150 W");
  await expect(measured.getByTestId(`consumer-switch-${LAMP}`)).toContainText("Lampe");
  await expect(page.getByTestId("consumer-switch-0")).toHaveCount(0);
  await expect(page.getByTestId("consumers-switchable")).toHaveCount(0);
  await expect(page.locator('[data-testid^="consumer-mode-"]')).toHaveCount(0);

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
    "Zeigt Steckdosen-Ladepunkte und Verbraucher aus evcc live an. Schalter kommen von Steckdosen-Addons.",
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
  // Ladepunkte und Meter stehen gemischt im selben Abschnitt, sortiert nach Name Z–A
  const measured = page.getByTestId("consumers-measured").locator(":scope > [data-testid]");
  await expect(measured).toHaveCount(5);
  expect(
    await measured.evaluateAll((els) => els.map((el) => el.getAttribute("data-testid"))),
  ).toEqual([
    "consumer-switch-1",
    `consumer-switch-${LAMP}`,
    "consumer-meter-kuehlschrank",
    "consumer-meter-kaffee",
    "consumer-meter-heizstab",
  ]);
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

test.describe("mit switches-tapo", () => {
  // Installation per API nach dem Laden der Seite: erst nach dem Neuladen lädt der Loader das Addon
  test.beforeEach(async ({ page }) => {
    await installSwitchesTapo();
    await page.reload();
  });

  test("„Lampe“ steht unter „Schaltbar“ mit ⏻ ☀, „Waschmaschine“ ohne Buttons", async ({
    page,
  }) => {
    await openEvcc(page, "#/addons/consumers");
    const switchable = page.getByTestId("consumers-switchable");
    const lamp = switchable.getByTestId(`consumer-switch-${LAMP}`);
    await expect(lamp.getByTestId(`consumer-mode-${LAMP}`)).toBeVisible();
    await expect(lamp.getByTestId("consumer-mode-power")).toBeVisible();
    await expect(lamp.getByTestId("consumer-mode-smart")).toBeVisible();
    const washer = page.getByTestId("consumers-measured").getByTestId("consumer-switch-1");
    await expect(washer).toBeVisible();
    await expect(washer.locator('[data-testid^="consumer-mode-"]')).toHaveCount(0);
  });

  test("der Modus lässt sich umschalten", async ({ page }) => {
    await openEvcc(page, "#/addons/consumers");
    const modes = page.getByTestId(`consumer-mode-${LAMP}`);
    const power = modes.getByTestId("consumer-mode-power");
    const smart = modes.getByTestId("consumer-mode-smart");
    await expect(power).toHaveAttribute("aria-pressed", "false");

    // ⏻: off → now → off
    await power.click();
    await expect(power).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => mode(page, LAMP)).toBe("now");
    await power.click();
    await expect(power).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => mode(page, LAMP)).toBe("off");

    // ☀: off → smart → off
    await smart.click();
    await expect(smart).toHaveAttribute("aria-pressed", "true");
    await expect(power).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => mode(page, LAMP)).toBe("smart");
    await smart.click();
    await expect(smart).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => mode(page, LAMP)).toBe("off");
  });

  test("die Modus-Gruppe steht im Kartenkopf rechts vom Titel", async ({ page }) => {
    await openEvcc(page, "#/addons/consumers");
    const card = page.getByTestId(`consumer-switch-${LAMP}`);
    const title = await card.getByTestId("consumer-title").boundingBox();
    const group = await card.getByTestId(`consumer-mode-${LAMP}`).boundingBox();
    expect(title).not.toBeNull();
    expect(group).not.toBeNull();
    if (!title || !group) return;
    expect(group.x).toBeGreaterThan(title.x + title.width - 1);
    // gleiche Zeile: die vertikalen Mitten liegen nah beieinander
    expect(Math.abs(group.y + group.height / 2 - (title.y + title.height / 2))).toBeLessThan(8);
  });

  test("⏻ am Verbraucher „kaffee“ schaltet die Tapo direkt, auch ohne Login", async ({ page }) => {
    const coffee = page.getByTestId("consumers-switchable").getByTestId("consumer-meter-kaffee");
    const tapoOn = async () =>
      ((await (await page.request.get(`${COFFEE_TAPO}/_test/state`)).json()) as { on: boolean }).on;
    for (const loggedIn of [true, false]) {
      if (!loggedIn) {
        await page.context().clearCookies();
        await page.reload();
      }
      await openEvcc(page, "#/addons/consumers");
      const power = coffee.getByTestId("consumer-switch-power");
      await expect(coffee.locator("button")).toHaveCount(1);
      await expect(power).toHaveAttribute("aria-pressed", "false");
      await power.click();
      await expect(power).toHaveAttribute("aria-pressed", "true");
      await expect.poll(tapoOn).toBe(true);
      const state = await page.request.get(COFFEE_STATE);
      expect(((await state.json()) as { on: boolean }).on).toBe(true);
      await power.click();
      await expect(power).toHaveAttribute("aria-pressed", "false");
      await expect.poll(tapoOn).toBe(false);
    }
    await expect(
      page.getByTestId("consumers-measured").getByTestId("consumer-meter-kuehlschrank"),
    ).toBeVisible();
  });

  test("ein abgelehnter Modus erscheint als Fehler auf der Karte", async ({ page }) => {
    await page.route(`**/api/loadpoints/${LAMP + 1}/mode/*`, (route) =>
      route.fulfill({ status: 500, body: "abgelehnt" }),
    );
    await openEvcc(page, "#/addons/consumers");
    const card = page.getByTestId(`consumer-switch-${LAMP}`);
    await card.getByTestId("consumer-mode-smart").click();
    await expect(card.getByTestId("consumer-error")).toHaveText(
      "Modus konnte nicht gesetzt werden: HTTP 500",
    );
  });
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
