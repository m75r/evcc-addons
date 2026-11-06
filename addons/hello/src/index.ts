// Beispiel-Addon: Eintrag im Menü „Mehr“ und eine Seite mit der PV-Leistung (live)
import type { ActivateFn, AddonApi } from "@evcc-addons/sdk";

const TEXT = {
  de: { label: "Hallo", pv: "PV-Leistung", waiting: "warte auf Daten …" },
  en: { label: "Hello", pv: "PV power", waiting: "waiting for data …" },
};

function text(api: AddonApi) {
  return api.locale().startsWith("de") ? TEXT.de : TEXT.en;
}

function mountPage(el: HTMLElement, api: AddonApi): () => void {
  const line = document.createElement("p");
  line.className = "fs-4";
  line.setAttribute("data-testid", "hello-pv");
  line.textContent = `${text(api).pv}: ${text(api).waiting}`;
  el.append(line);
  return api.state.subscribe("pvPower", (value) => {
    line.textContent = `${text(api).pv}: ${Math.round(Number(value))} W`;
  });
}

export const activate: ActivateFn = (api) => {
  api.addMoreMenuItem({ label: { de: TEXT.de.label, en: TEXT.en.label } });
  api.registerPage({
    title: { de: "Hallo Welt", en: "Hello World" },
    mount: (el, ctx) => mountPage(el, ctx.api),
  });
};
