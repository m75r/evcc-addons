// Verbraucher-Addon: Tab „Verbraucher“ mit Seite #/addons/consumers
import type { ActivateFn } from "@evcc-addons/sdk";
import { render } from "preact";
import { ConsumersPage } from "./ConsumersPage.js";
import { SOCKET_ICON } from "./icons.js";
import styles from "./styles.css";

const STYLE_ID = "evcc-consumers-style";

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = styles;
  document.head.append(style);
}

export const activate: ActivateFn = (api) => {
  api.addTab({ label: { de: "Verbraucher", en: "Consumers" }, icon: SOCKET_ICON });
  api.registerPage({
    title: { de: "Verbraucher", en: "Consumers" },
    mount: (el, ctx) => {
      injectStyles();
      render(<ConsumersPage api={ctx.api} />, el);
      return () => render(null, el);
    },
  });
};
