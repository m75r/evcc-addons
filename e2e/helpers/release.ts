// Release der Plattform im Fake-Katalog setzen und den Cache des Proxys (1 h) mit dem Login der Seite leeren
import { expect, type Page } from "@playwright/test";
import { writeRelease } from "../seed.mjs";

/** `tag` z. B. "v99.0.0"; `null` lässt /releases/latest mit 404 antworten */
export async function setFakeRelease(page: Page, tag: string | null): Promise<void> {
  writeRelease(tag);
  const res = await page.request.get("/addons-api/platform?refresh=1");
  expect(res.ok()).toBe(true);
}

/** Laufende Version des Proxys */
export async function runningVersion(page: Page): Promise<string> {
  const res = await page.request.get("/addons-api/health");
  return ((await res.json()) as { version: string }).version;
}
