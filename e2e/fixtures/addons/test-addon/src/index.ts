// E2E-Fixture: Tab, Menüeintrag auf eine Unterseite, zwei Seiten, Live-Daten und eine Einstellung
import type { ActivateFn, AddonApi } from "@evcc-addons/sdk";

function paragraph(el: HTMLElement, testId: string, text: string): HTMLParagraphElement {
  const p = document.createElement("p");
  p.setAttribute("data-testid", testId);
  p.textContent = text;
  el.append(p);
  return p;
}

function showSetting(p: HTMLElement, api: AddonApi): void {
  p.textContent = `showPv: ${String(api.settings.get("showPv"))}`;
}

export const activate: ActivateFn = (api) => {
  api.addTab({ label: "Test-Tab" });
  api.addMoreMenuItem({ label: "Test-Eintrag", page: "detail" });
  api.registerPage({
    title: "Test-Addon",
    mount(el, ctx) {
      const pv = paragraph(el, "test-addon-pv", "PV: –");
      const setting = paragraph(el, "test-addon-setting", "");
      showSetting(setting, ctx.api);
      const offState = ctx.api.state.subscribe("pvPower", (value) => {
        pv.textContent = `PV: ${String(value)} W`;
      });
      const offSettings = ctx.api.settings.onChange(() => showSetting(setting, ctx.api));
      return () => {
        offState();
        offSettings();
      };
    },
  });
  api.registerPage({
    path: "detail",
    title: "Test-Detail",
    mount(el) {
      el.innerHTML = '<p data-testid="test-addon-detail">Detailseite</p>';
    },
  });
};
