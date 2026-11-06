// Eintrag „Addons“ im Menü „Mehr“ (nach „Konfiguration“)
import { CONFIG_ITEM, MORE_MENU } from "../dom/anchors.js";
import { cloneMenuItem } from "../dom/clone.js";
import { t } from "../i18n.js";
import { navigate } from "./router.js";

export const ADDONS_ITEM_TESTID = "addons-more-item";
export const ADDONS_PATH = "/addons";

export interface AddonsItemOptions {
  locale: () => string;
  currentPath: () => string;
}

/** Setzt den Eintrag ein, falls er fehlt, und aktualisiert Label und Aktiv-Zustand */
export function ensureAddonsItem(opts: AddonsItemOptions): HTMLAnchorElement | null {
  const menu = document.querySelector(MORE_MENU);
  if (!menu) return null;
  let item = menu.querySelector<HTMLAnchorElement>(`[data-testid="${ADDONS_ITEM_TESTID}"]`);
  if (!item) item = insertItem(menu, opts.locale());
  updateAddonsItem(item, opts);
  return item;
}

function insertItem(menu: Element, lang: string): HTMLAnchorElement {
  const config = menu.querySelector(CONFIG_ITEM);
  const template = config ?? menu.querySelector("a.dropdown-item");
  const item = cloneMenuItem(template, {
    label: t("addons.title", lang),
    href: "#" + ADDONS_PATH,
    testId: ADDONS_ITEM_TESTID,
  });
  item.addEventListener("click", (event) => {
    event.preventDefault();
    navigate(ADDONS_PATH);
  });
  if (config) config.after(item);
  else menu.append(item);
  return item;
}

export function updateAddonsItem(item: HTMLAnchorElement, opts: AddonsItemOptions): void {
  const label = t("addons.title", opts.locale());
  if (item.textContent !== label) item.textContent = label;
  item.classList.toggle("active", opts.currentPath() === ADDONS_PATH);
}
