import { beforeEach, describe, expect, it } from "vitest";
import { keepInserted } from "../src/dom/keep-alive.js";
import { TAB_ROUTE_CLASS, NavRegistry } from "../src/nav/registry.js";
import { nextFrame, renderEvccDom } from "./evcc-dom.js";

let path = "/";
let nav: NavRegistry;

beforeEach(() => {
  renderEvccDom();
  path = "/";
  nav = new NavRegistry({ locale: () => document.documentElement.lang, currentPath: () => path });
});

const byTestId = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);

describe("NavRegistry", () => {
  it("fügt den Tab vor „Mehr“ ein, sichtbar erst ab 576 px", () => {
    nav.addTab("test", { label: { de: "Test-Tab", en: "Test tab" } });
    const tab = byTestId("addon-tab-test-0");
    expect(tab?.nextElementSibling?.getAttribute("data-testid")).toBe("tab-more");
    expect(tab?.classList.contains("d-none")).toBe(true);
    expect(tab?.classList.contains("d-sm-flex")).toBe(true);
    expect(tab?.classList.contains("d-flex")).toBe(false);
    expect(tab?.classList.contains("active")).toBe(false);
    expect(tab?.hasAttribute("data-v-tab")).toBe(true);
    expect(tab?.querySelector(".tab-content > .tab-icon")).not.toBeNull();
    expect(tab?.querySelector(".tab-label")?.textContent).toBe("Test-Tab");
    expect(tab?.getAttribute("href")).toBe("#/addons/test");
  });

  it("spiegelt den Tab im Menü „Mehr“ mit d-sm-none", () => {
    nav.addTab("test", { label: "Test-Tab" });
    const mirror = byTestId("addon-tab-test-0-more");
    expect(mirror?.classList.contains("dropdown-item")).toBe(true);
    expect(mirror?.classList.contains("d-sm-none")).toBe(true);
    expect(mirror?.previousElementSibling?.getAttribute("data-testid")).toBe("addons-more-item");
  });

  it("ordnet Menüeinträge hinter „Addons“ in Registrierungsreihenfolge", () => {
    nav.addMoreMenuItem("a", { label: "Erster" });
    nav.addMoreMenuItem("b", { label: "Zweiter", page: "detail" });
    const addons = byTestId("addons-more-item");
    expect(addons?.nextElementSibling?.textContent).toBe("Erster");
    expect(addons?.nextElementSibling?.nextElementSibling?.getAttribute("href")).toBe(
      "#/addons/b/detail",
    );
  });

  it("setzt entfernte Elemente wieder ein", async () => {
    nav.addTab("test", { label: "Test-Tab" });
    const stop = keepInserted(() => nav.render());
    byTestId("addon-tab-test-0")?.remove();
    byTestId("addon-tab-test-0-more")?.remove();
    await nextFrame();
    await nextFrame();
    expect(byTestId("addon-tab-test-0")).not.toBeNull();
    expect(byTestId("addon-tab-test-0-more")).not.toBeNull();
    stop();
  });

  it("markiert die Tab-Route und setzt html.evcc-addons-tab-route", () => {
    nav.addTab("test", { label: "Test-Tab" });
    nav.updateActive("/addons/test");
    expect(byTestId("addon-tab-test-0")?.classList.contains("active")).toBe(true);
    expect(document.documentElement.classList.contains(TAB_ROUTE_CLASS)).toBe(true);
    nav.updateActive("/forecast");
    expect(byTestId("addon-tab-test-0")?.classList.contains("active")).toBe(false);
    expect(document.documentElement.classList.contains(TAB_ROUTE_CLASS)).toBe(false);
  });

  it("lokalisiert Labels nach einem Sprachwechsel neu", () => {
    nav.addTab("test", { label: { de: "Verbraucher", en: "Consumers" } });
    document.documentElement.lang = "en";
    nav.relocalize();
    expect(byTestId("addon-tab-test-0")?.querySelector(".tab-label")?.textContent).toBe(
      "Consumers",
    );
    expect(byTestId("addon-tab-test-0-more")?.textContent).toBe("Consumers");
  });

  it("lässt freie Ziele (href) unverändert", () => {
    nav.addMoreMenuItem("a", { label: "Doku", href: "https://docs.evcc.io" });
    expect(byTestId("addon-menu-a-0")?.getAttribute("href")).toBe("https://docs.evcc.io");
  });
});
