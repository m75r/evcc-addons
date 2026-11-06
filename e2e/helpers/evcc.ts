// Hilfen für die evcc-Oberfläche in E2E-Tests
import { expect, type Page } from "@playwright/test";

export const ADMIN_PASSWORD = "e2e-secret";

/** Öffnet eine Seite und wartet, bis evcc Live-Daten anzeigt */
export async function openEvcc(page: Page, hash = "#/"): Promise<void> {
  await page.goto("/" + hash);
  await expect(page.getByTestId("bottom-tab-bar")).toBeVisible();
  await expect(page.getByTestId("bottom-tab-bar")).not.toHaveClass(/bottom-tab-bar--hidden/);
}

export async function openMoreMenu(page: Page): Promise<void> {
  await page.getByTestId("tab-more").click();
  await expect(page.locator(".more-menu")).toHaveClass(/open/);
}
