import { beforeEach, describe, expect, it } from "vitest";
import { CONFIG_ITEM } from "../src/dom/anchors.js";
import { cloneMenuItem } from "../src/dom/clone.js";
import { renderEvccDom } from "./evcc-dom.js";

beforeEach(renderEvccDom);

describe("cloneMenuItem", () => {
  it("behält data-v-* und verliert die Aktiv-Klassen", () => {
    const template = document.querySelector(CONFIG_ITEM);
    const item = cloneMenuItem(template, { label: "Addons", href: "#/addons", testId: "x" });
    expect(item.hasAttribute("data-v-menu")).toBe(true);
    expect(item.classList.contains("dropdown-item")).toBe(true);
    expect(item.classList.contains("active")).toBe(false);
    expect(item.classList.contains("router-link-active")).toBe(false);
    expect(item.getAttribute("href")).toBe("#/addons");
    expect(item.getAttribute("data-testid")).toBe("x");
    expect(item.textContent).toBe("Addons");
    expect(item.children).toHaveLength(0);
  });

  it("nutzt ohne Vorbild einen Fallback", () => {
    const item = cloneMenuItem(null, { label: "Addons", href: "#/addons", testId: "x" });
    expect(item.className).toBe("dropdown-item evcc-addons-fallback");
  });
});
