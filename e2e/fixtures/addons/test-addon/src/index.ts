// E2E-Fixture: Tab, Menüeintrag auf eine Unterseite, zwei Seiten und Live-Daten
import type { ActivateFn } from "@evcc-addons/sdk";

export const activate: ActivateFn = (api) => {
  api.addTab({ label: "Test-Tab" });
  api.addMoreMenuItem({ label: "Test-Eintrag", page: "detail" });
  api.registerPage({
    title: "Test-Addon",
    mount(el, ctx) {
      const pv = document.createElement("p");
      pv.setAttribute("data-testid", "test-addon-pv");
      pv.textContent = "PV: –";
      el.append(pv);
      return ctx.api.state.subscribe("pvPower", (value) => {
        pv.textContent = `PV: ${String(value)} W`;
      });
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
