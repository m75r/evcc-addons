// Setzt das evcc-Admin-Passwort (wie auf dem Pi), ohne den Login-Cookie zu speichern
import { expect, test as setup } from "@playwright/test";
import { ADMIN_PASSWORD } from "../helpers/evcc.js";

setup("evcc-Admin-Passwort setzen", async ({ request }) => {
  const status = await request.get("/api/auth/status");
  if (status.status() !== 501) return;
  const res = await request.put("/api/auth/password", {
    data: { current: "", new: ADMIN_PASSWORD },
  });
  expect(res.ok()).toBe(true);
  expect((await request.get("/api/auth/status")).status()).toBe(200);
});
