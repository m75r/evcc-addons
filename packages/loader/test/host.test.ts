import { beforeEach, describe, expect, it, vi } from "vitest";
import { PAGE_ID, PAGE_ROUTE_CLASS, PageHost } from "../src/page/host.js";
import { documentTitle } from "../src/page/title.js";
import { renderEvccDom } from "./evcc-dom.js";

let host: PageHost;

beforeEach(() => {
  documentTitle.set(null);
  renderEvccDom();
  host = new PageHost(() => "de");
  host.attach();
});

const routeClass = () => document.documentElement.classList.contains(PAGE_ROUTE_CLASS);

describe("PageHost", () => {
  it("liegt direkt nach #app außerhalb von #app", () => {
    const container = document.getElementById(PAGE_ID);
    expect(container?.previousElementSibling?.id).toBe("app");
    expect(container?.classList.contains("safe-area-inset")).toBe(true);
    expect(container?.hidden).toBe(true);
  });

  it("mountet und unmountet je nach Route", () => {
    const cleanup = vi.fn();
    const mount = vi.fn((el: HTMLElement) => {
      el.textContent = "Inhalt";
      return cleanup;
    });
    host.register("/addons", mount, { exact: true });
    host.show("/addons");
    expect(mount).toHaveBeenCalledOnce();
    expect(host.container.hidden).toBe(false);
    expect(host.container.textContent).toBe("Inhalt");
    expect(routeClass()).toBe(true);
    host.show("/");
    expect(cleanup).toHaveBeenCalledOnce();
    expect(host.container.hidden).toBe(true);
    expect(host.container.textContent).toBe("");
    expect(routeClass()).toBe(false);
  });

  it("übergibt den Unterpfad und bevorzugt spezifische Muster", () => {
    const manager = vi.fn();
    const addon = vi.fn();
    host.register("/addons", manager, { exact: true });
    host.register("/addons/hello", addon);
    host.show("/addons/hello/detail/1");
    expect(addon).toHaveBeenCalledWith(expect.any(HTMLElement), "detail/1");
    expect(manager).not.toHaveBeenCalled();
  });

  it("zeigt „Seite nicht gefunden“ für unbekannte Addon-Pfade, sobald alle Addons geladen sind", () => {
    host.register("/addons", vi.fn(), { exact: true });
    host.show("/addons/unbekannt");
    expect(host.container.hidden).toBe(false);
    expect(host.container.textContent).toBe("");
    host.setReady();
    expect(host.container.textContent).toBe("Seite nicht gefunden");
  });

  it("mountet eine später registrierte Seite nach setReady", () => {
    host.show("/addons/hello");
    const mount = vi.fn();
    host.register("/addons/hello", mount, { title: () => "Hallo Welt" });
    host.setReady();
    expect(mount).toHaveBeenCalledOnce();
    expect(host.container.querySelector("header h1")?.textContent).toBe("Hallo Welt");
  });

  it("zeigt Fehler beim Mounten an und meldet sie", () => {
    const onError = vi.fn();
    host.register(
      "/addons/kaputt",
      () => {
        throw new TypeError("x is undefined");
      },
      { onError },
    );
    host.show("/addons/kaputt");
    expect(host.container.textContent).toContain("TypeError: x is undefined");
    expect(onError).toHaveBeenCalledWith(expect.any(TypeError));
  });

  it("setzt den Tab-Titel auf Addon-Seiten und hält ihn gegen evcc", async () => {
    host.register("/addons/hello", vi.fn(), { title: () => "Hallo Welt" });
    host.show("/addons/hello");
    expect(document.title).toBe("Hallo Welt | evcc");
    document.title = "... | evcc";
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.title).toBe("Hallo Welt | evcc");
    host.show("/");
    document.title = "Laden | evcc";
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.title).toBe("Laden | evcc");
  });

  it("rendert ohne Kopfzeile, wenn header: false", () => {
    host.register("/addons", vi.fn(), { exact: true, title: () => "Addons", header: false });
    host.show("/addons");
    expect(host.container.querySelector("header")).toBeNull();
    expect(document.title).toBe("Addons | evcc");
  });

  it("mountet denselben Pfad nur einmal", () => {
    const mount = vi.fn();
    host.register("/addons", mount, { exact: true });
    host.show("/addons");
    host.show("/addons");
    expect(mount).toHaveBeenCalledOnce();
  });
});
