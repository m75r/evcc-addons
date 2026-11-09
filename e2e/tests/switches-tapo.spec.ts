// Addon switches-tapo: evcc schaltet die Fake-Tapo über das Gateway, Schaltungen am Gerät werden übernommen
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { repoPath } from "../helpers/addons.js";
import { openEvcc } from "../helpers/evcc.js";
import { loginViaUi } from "../helpers/login.js";
import { installSwitchesTapo } from "../helpers/switches-tapo.js";

const TAPO = "http://127.0.0.1:17090";
/** Ladepunkt „Lampe“ ist der dritte in e2e/fixtures/evcc.yaml */
const POSITION = 3;
const LAMP = (
  JSON.parse(readFileSync(repoPath("e2e/fixtures/switches.json"), "utf8")) as {
    switches: { id: string; token: string }[];
  }
).switches[0];
/** Halt nach gesetztem Modus (HOLD_AFTER_MODE_MS) plus Puffer */
const HOLD_MS = 2500;
const GATEWAY = "/addons-api/ext/switches-tapo";

interface Command {
  on: boolean;
  at: number;
}

test.describe.configure({ mode: "serial" });

// Altes Format (version 1, Feld loadpoint): „Lampe“ muss als Ladepunkt-Bindung erscheinen
test.beforeAll(() => installSwitchesTapo("switches.json"));

/** Öffnet auf der Seite „Addons“ den Dialog „Tapo-Steckdosen“ über den Icon-Button der Karte */
async function openDialog(page: Page) {
  const button = page.getByTestId("addon-card-switches-tapo").getByTestId("addon-dialog-0");
  await expect(button).toHaveAttribute("aria-label", "Tapo-Steckdosen");
  await button.click();
  const modal = page.getByTestId("addon-dialog-modal");
  await expect(modal.locator(".modal-title")).toHaveText("Tapo-Steckdosen");
  return modal;
}

async function tapoOn(request: APIRequestContext): Promise<boolean> {
  const res = await request.get(`${TAPO}/_test/state`);
  return ((await res.json()) as { on: boolean }).on;
}

async function commandsSince(request: APIRequestContext, since: number): Promise<Command[]> {
  const res = await request.get(`${TAPO}/_test/commands`);
  return ((await res.json()) as Command[]).filter((entry) => entry.at >= since);
}

/** Schaltung am Gerät; liefert den Zeitpunkt (Uhr der Fake-Tapo) */
async function press(request: APIRequestContext, on: boolean): Promise<number> {
  const res = await request.post(`${TAPO}/_test/press?on=${on}`);
  return ((await res.json()) as { at: number }).at;
}

async function setMode(request: APIRequestContext, mode: string): Promise<void> {
  const res = await request.post(`/api/loadpoints/${POSITION}/mode/${mode}`);
  expect(res.ok()).toBe(true);
}

async function mode(request: APIRequestContext): Promise<unknown> {
  const res = await request.get(`/api/state?jq=.loadpoints[${POSITION - 1}].mode`);
  return res.json();
}

async function expectDevice(request: APIRequestContext, on: boolean): Promise<void> {
  await expect.poll(() => tapoOn(request), { timeout: 10_000 }).toBe(on);
}

test("evcc schaltet die Steckdose über das Gateway", async ({ request }) => {
  const since = Date.now();
  await setMode(request, "now");
  await expectDevice(request, true);
  expect((await commandsSince(request, since)).map((entry) => entry.on)).toContain(true);
  await setMode(request, "off");
  await expectDevice(request, false);
});

test("der Dialog zeigt die Lampe aus dem alten Format mit Status und YAML", async ({ page }) => {
  await loginViaUi(page);
  const modal = await openDialog(page);
  await expect(modal.getByTestId("switches-migration-hint")).toContainText(
    "/addons-api/ext/switches-tapo/",
  );
  const card = modal.getByTestId(`switch-card-${LAMP.id}`);
  await expect(card.getByTestId("switch-status")).toHaveText("○ aus");
  await expect(card.getByTestId("switch-target")).toContainText("Ladepunkt „Lampe“");
  await expect(card.getByTestId("switch-host")).toHaveText("Tapo · 127.0.0.1:17090");
  await expect(card.getByTestId("switch-target-warning")).toHaveCount(0);
  await card.getByTestId("switch-yaml-toggle").click();
  await expect(card.getByTestId("switch-yaml")).toContainText(
    `uri: http://localhost:17080${GATEWAY}/${LAMP.id}/${LAMP.token}/state`,
  );
});

test("Steckdose im Dialog anlegen, Token erneuern und löschen", async ({ page }) => {
  await loginViaUi(page);
  const dialog = await openDialog(page);
  await dialog.getByTestId("switches-new").click();
  const modal = dialog.getByTestId("switch-form");
  // Ladepunkt steht oben; die Auswahl übernimmt den Titel als Name. Der Charger von „Lampe“ ist
  // keine Tapo aus der evcc-Oberfläche, daher bleibt die Adresse offen
  await modal.getByTestId("switch-target").selectOption("loadpoint:Lampe");
  await expect(modal.getByTestId("switch-field-name")).toHaveValue("Lampe");
  await expect(modal.getByTestId("switch-host-unknown")).toBeVisible();
  await modal.getByTestId("switch-field-name").fill("Test");
  await modal.getByTestId("switch-field-host").fill("127.0.0.1:17090");
  await modal.getByTestId("switch-field-user").fill("ich@example.com");
  await modal.getByTestId("switch-field-password").fill("tapo-secret");
  await modal.getByTestId("switch-form-save").click();
  await expect(modal).toHaveCount(0);

  const list = await page.request.get(`${GATEWAY}/`);
  const created = (
    (await list.json()) as { switches: { id: string; token: string; name: string }[] }
  ).switches.find((entry) => entry.name === "Test");
  expect(created).toBeDefined();
  if (!created) return;
  const card = dialog.getByTestId(`switch-card-${created.id}`);
  await expect(card.getByTestId("switch-status")).toHaveText("○ aus");
  const stateUrl = (token: string) => `${GATEWAY}/${created.id}/${token}/state`;
  expect((await page.request.get(stateUrl(created.token))).status()).toBe(200);

  await card.getByTestId("switch-yaml-toggle").click();
  page.once("dialog", (dialog) => void dialog.accept());
  await card.getByTestId("switch-token-renew").click();
  await expect(card.getByTestId("switch-yaml")).not.toContainText(created.token);
  expect((await page.request.get(stateUrl(created.token))).status()).toBe(404);

  page.once("dialog", (dialog) => void dialog.accept());
  await card.getByTestId("switch-delete").click();
  await expect(card).toHaveCount(0);
});

test.describe("Schaltung am Gerät", () => {
  test("Taster aus im Modus „now“: Modus wird „off“, kein Zurückschalten", async ({ request }) => {
    await setMode(request, "now");
    await expectDevice(request, true);
    const at = await press(request, false);
    await expect.poll(() => mode(request), { timeout: 10_000 }).toBe("off");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(await commandsSince(request, at)).not.toContainEqual(
      expect.objectContaining({ on: true }),
    );
    expect(await tapoOn(request)).toBe(false);
  });

  test("Taster ein im Modus „off“: Modus wird „now“, kein Ausschalten", async ({ request }) => {
    expect(await mode(request)).toBe("off");
    const at = await press(request, true);
    await expect.poll(() => mode(request), { timeout: 10_000 }).toBe("now");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(await commandsSince(request, at)).not.toContainEqual(
      expect.objectContaining({ on: false }),
    );
    expect(await tapoOn(request)).toBe(true);
  });

  test("Taster aus im Modus „smart“: Modus wird „off“, danach schaltet „now“ normal", async ({
    request,
  }) => {
    await new Promise((resolve) => setTimeout(resolve, HOLD_MS));
    await setMode(request, "smart");
    await expect.poll(() => mode(request)).toBe("smart");
    expect(await tapoOn(request)).toBe(true);
    const at = await press(request, false);
    await expect.poll(() => mode(request), { timeout: 10_000 }).toBe("off");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(await commandsSince(request, at)).not.toContainEqual(
      expect.objectContaining({ on: true }),
    );
    expect(await tapoOn(request)).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, HOLD_MS));
    await setMode(request, "now");
    await expectDevice(request, true);
    await setMode(request, "off");
    await expectDevice(request, false);
  });
});

test("die Einstellung „Abfrageintervall“ bleibt nach dem Neuladen gespeichert", async ({
  page,
}) => {
  await loginViaUi(page);
  const card = page.getByTestId("addon-card-switches-tapo");
  await card.getByTestId("addon-settings").click();
  const modal = page.getByTestId("addon-settings-modal");
  const field = modal.getByTestId("addon-setting-pollSeconds");
  await expect(field).toHaveValue("5");
  await field.selectOption("10");
  await modal.getByTestId("addon-settings-save").click();
  await expect(modal).toHaveCount(0);
  await page.reload();
  await card.getByTestId("addon-settings").click();
  await expect(modal.getByTestId("addon-setting-pollSeconds")).toHaveValue("10");
});

test("Steckdose an einen Verbraucher binden: Zähler-YAML, ⏻-Route nur dafür", async ({ page }) => {
  await loginViaUi(page);
  const dialog = await openDialog(page);
  await dialog.getByTestId("switches-new").click();
  const form = dialog.getByTestId("switch-form");
  const target = form.getByTestId("switch-target");
  await expect(target.locator("optgroup")).toHaveCount(2);
  await target.selectOption("consumer:kuehlschrank");
  await expect(form.getByTestId("switch-field-name")).toHaveValue("kuehlschrank");
  await expect(form.getByTestId("switch-target-hint")).toContainText("schaltet aber nicht");
  await form.getByTestId("switch-field-host").fill("127.0.0.1:17091");
  await form.getByTestId("switch-field-user").fill("ich@example.com");
  await form.getByTestId("switch-field-password").fill("tapo-secret");
  await form.getByTestId("switch-form-save").click();
  await expect(form).toHaveCount(0);

  const list = await page.request.get(`${GATEWAY}/`);
  const created = (
    (await list.json()) as { switches: { id: string; name: string }[] }
  ).switches.find((entry) => entry.name === "kuehlschrank");
  expect(created).toBeDefined();
  if (!created) return;
  const card = dialog.getByTestId(`switch-card-${created.id}`);
  await expect(card.getByTestId("switch-target")).toContainText("Verbraucher „kuehlschrank“");
  await card.getByTestId("switch-yaml-toggle").click();
  await expect(card.getByTestId("switch-yaml")).toContainText("jq: .power // 0");
  await expect(card.getByTestId("switch-yaml-hint")).toContainText("Benutzerdefiniertes Gerät");

  const lamp = await page.request.post(`${GATEWAY}/${LAMP.id}/power`, { data: { on: true } });
  expect(lamp.status()).toBe(409);
  page.once("dialog", (dialog) => void dialog.accept());
  await card.getByTestId("switch-delete").click();
  await expect(card).toHaveCount(0);
});

test("die Startseite zeigt den Ladepunkt „Lampe“", async ({ page }) => {
  await openEvcc(page);
  await expect(page.getByText("Lampe").first()).toBeVisible();
});
