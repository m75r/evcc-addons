// Browser-Teil von switches-tapo: Dialog „Tapo-Steckdosen“ auf der Seite „Addons“ und
// Schalter ⏻ ☀ in den Karten von consumers (Erweiterungspunkt consumers.cardActions)
import type { ActivateFn, ManagerDialogContext } from "@evcc-addons/sdk";
import { render } from "preact";
import { cardActions } from "./actions/cardActions.js";
import { CARD_ACTIONS } from "./actions/contract.js";
import { createSwitchClient, type SwitchClient } from "./dialog/client.js";
import { browserStorage } from "./dialog/MigrationHint.js";
import { SwitchesDialog } from "./dialog/SwitchesDialog.js";
import { SOCKET_ICON } from "./icons.js";
import styles from "./styles.css";
import { SwitchListStore } from "./switch-list.js";

const STYLE_ID = "evcc-switches-tapo-style";
const NAME = { de: "Tapo-Steckdosen", en: "Tapo smart plugs" };

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = styles;
  document.head.append(style);
}

function mountDialog(
  el: HTMLElement,
  ctx: ManagerDialogContext,
  client: SwitchClient,
  store: SwitchListStore,
): () => void {
  render(
    <SwitchesDialog
      locale={ctx.locale}
      canManage={ctx.canManage}
      confirm={ctx.confirm}
      onUnauthorized={ctx.onUnauthorized}
      client={client}
      store={store}
      storage={browserStorage()}
    />,
    el,
  );
  return () => render(null, el);
}

export const activate: ActivateFn = (api) => {
  injectStyles();
  const client = createSwitchClient(api);
  const store = new SwitchListStore({ load: () => client.listSwitches(), settings: api.settings });
  api.addManagerDialog({
    label: NAME,
    title: NAME,
    icon: SOCKET_ICON,
    mount: (el, ctx) => mountDialog(el, ctx, client, store),
  });
  // Derselbe Store wie im Dialog: ein Abfragetakt für Dialog und Buttons
  api.extensions.provide(CARD_ACTIONS, cardActions({ api, client, store }));
};
