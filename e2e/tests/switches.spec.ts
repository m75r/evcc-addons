// Schalt-Gateway: evcc schaltet die Fake-Tapo über den Proxy, Schaltungen am Gerät werden übernommen
import { expect, test, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { repoPath } from "../helpers/addons.js";
import { openEvcc } from "../helpers/evcc.js";
import { loginViaUi } from "../helpers/login.js";

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

interface Command {
  on: boolean;
  at: number;
}

test.describe.configure({ mode: "serial" });

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

test("Abschnitt „Steckdosen“ zeigt die Lampe mit Status und YAML", async ({ page }) => {
  await loginViaUi(page);
  const card = page.getByTestId(`switch-card-${LAMP.id}`);
  await expect(card.getByTestId("switch-status")).toHaveText("○ aus");
  await expect(card.getByTestId("switch-loadpoint")).toContainText("Ladepunkt „Lampe“");
  await expect(card.getByTestId("switch-host")).toHaveText("Tapo · 127.0.0.1:17090");
  await expect(card.getByTestId("switch-loadpoint-warning")).toHaveCount(0);
  await card.getByTestId("switch-yaml-toggle").click();
  await expect(card.getByTestId("switch-yaml")).toContainText(
    `uri: http://localhost:17080/addons-api/switches/${LAMP.id}/${LAMP.token}/state`,
  );
});

test("Steckdose anlegen, Token erneuern und löschen", async ({ page }) => {
  await loginViaUi(page);
  await page.getByTestId("switches-new").click();
  const modal = page.getByTestId("switch-modal");
  // Ladepunkt steht oben; die Auswahl übernimmt den Titel als Name. Der Charger von „Lampe“ ist
  // keine Tapo aus der evcc-Oberfläche, daher bleibt die Adresse offen
  await modal.getByTestId("switch-field-loadpoint").selectOption("Lampe");
  await expect(modal.getByTestId("switch-field-name")).toHaveValue("Lampe");
  await expect(modal.getByTestId("switch-host-unknown")).toBeVisible();
  await modal.getByTestId("switch-field-name").fill("Test");
  await modal.getByTestId("switch-field-host").fill("127.0.0.1:17090");
  await modal.getByTestId("switch-field-user").fill("ich@example.com");
  await modal.getByTestId("switch-field-password").fill("tapo-secret");
  await modal.getByTestId("switch-modal-save").click();
  await expect(modal).toHaveCount(0);

  const list = await page.request.get("/addons-api/switches");
  const created = (
    (await list.json()) as { switches: { id: string; token: string; name: string }[] }
  ).switches.find((entry) => entry.name === "Test");
  expect(created).toBeDefined();
  if (!created) return;
  const card = page.getByTestId(`switch-card-${created.id}`);
  await expect(card.getByTestId("switch-status")).toHaveText("○ aus");
  const stateUrl = (token: string) => `/addons-api/switches/${created.id}/${token}/state`;
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

test("die Startseite zeigt den Ladepunkt „Lampe“", async ({ page }) => {
  await openEvcc(page);
  await expect(page.getByText("Lampe").first()).toBeVisible();
});
