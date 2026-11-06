import { beforeEach, describe, expect, it } from "vitest";
import { ADDONS_ITEM_TESTID, ensureAddonsItem } from "../src/nav/addons-item.js";
import { keepInserted } from "../src/dom/keep-alive.js";
import { nextFrame, renderEvccDom } from "./evcc-dom.js";

beforeEach(renderEvccDom);

const opts = (path = "/") => ({
  locale: () => document.documentElement.lang,
  currentPath: () => path,
});
const item = () => document.querySelector(`[data-testid="${ADDONS_ITEM_TESTID}"]`);

describe("ensureAddonsItem", () => {
  it("fügt „Addons“ nach „Konfiguration“ ein", () => {
    ensureAddonsItem(opts());
    expect(item()?.previousElementSibling?.getAttribute("href")).toBe("#/config");
    expect(item()?.textContent).toBe("Addons");
    expect(item()?.classList.contains("active")).toBe(false);
  });

  it("markiert den Eintrag auf #/addons als aktiv", () => {
    ensureAddonsItem(opts("/addons"));
    expect(item()?.classList.contains("active")).toBe(true);
  });

  it("setzt den Eintrag nach dem Entfernen wieder ein", async () => {
    ensureAddonsItem(opts());
    const stop = keepInserted(() => ensureAddonsItem(opts()));
    item()?.remove();
    await nextFrame();
    await nextFrame();
    expect(item()).not.toBeNull();
    stop();
  });
});
