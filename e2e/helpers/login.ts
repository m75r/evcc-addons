// Anmeldung über das Anmeldefeld der Seite „Addons“ (setzt den evcc-Cookie, danach Neuladen)
import { expect, type Page } from "@playwright/test";
import { ADMIN_PASSWORD, openEvcc } from "./evcc.js";

export async function loginViaUi(page: Page, password = ADMIN_PASSWORD): Promise<void> {
  await openEvcc(page, "#/addons");
  const form = page.getByTestId("addons-login");
  await form.getByRole("textbox").or(form.locator('input[type="password"]')).fill(password);
  const reloaded = page.waitForEvent("load");
  await form.getByRole("button", { name: "Anmelden" }).click();
  await reloaded;
  await expect(page.getByTestId("addons-install")).toBeVisible();
}
