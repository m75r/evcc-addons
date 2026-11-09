// E2E-Fixture: Eintrag im Menü „Mehr“ und eine Seite mit der PV-Leistung (live), ohne Einstellungen
import type { ActivateFn } from "@evcc-addons/sdk";

export const activate: ActivateFn = (api) => {
  api.addMoreMenuItem({ label: "Menü-Test" });
  api.registerPage({
    title: "Menü-Addon",
    mount(el, ctx) {
      const line = document.createElement("p");
      line.setAttribute("data-testid", "menu-addon-pv");
      line.textContent = "PV-Leistung: warte auf Daten …";
      el.append(line);
      return ctx.api.state.subscribe("pvPower", (value) => {
        line.textContent = `PV-Leistung: ${Math.round(Number(value))} W`;
      });
    },
  });
};
