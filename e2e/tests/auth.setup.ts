// Setzt das evcc-Admin-Passwort (wie auf dem Pi), ohne den Login-Cookie zu speichern
import { expect, test as setup } from "@playwright/test";
import { setAdminPassword } from "@evcc-addons/sdk/testing/playwright";

setup("evcc-Admin-Passwort setzen", async ({ request }) => {
  await setAdminPassword(request);
  expect((await request.get("/api/auth/status")).status()).toBe(200);
});
