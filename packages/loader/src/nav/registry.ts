// Navigation der Addons: Tabs in der Menüleiste und Einträge im Menü „Mehr“
import type { NavItem } from "@evcc-addons/sdk";
import { MORE_MENU, TAB_BAR, TAB_ITEM, TAB_MORE } from "../dom/anchors.js";
import { cloneMenuItem, cloneTabItem } from "../dom/clone.js";
import { localize } from "../i18n.js";
import { ensureAddonsItem } from "./addons-item.js";
import { navigate } from "./router.js";

export const TAB_ROUTE_CLASS = "evcc-addons-tab-route";

interface Entry {
  kind: "tab" | "menu";
  item: NavItem;
  testId: string;
  /** Interner Pfad (`/addons/<id>[/<page>]`) oder freies Ziel */
  target: { path: string } | { href: string };
  tab?: HTMLAnchorElement;
  menu?: HTMLAnchorElement;
}

export interface NavRegistryOptions {
  locale: () => string;
  currentPath: () => string;
}

export class NavRegistry {
  private readonly entries: Entry[] = [];
  private readonly counters = new Map<string, number>();

  constructor(private readonly opts: NavRegistryOptions) {}

  addTab(addonId: string, item: NavItem): void {
    this.add("tab", addonId, item);
  }

  addMoreMenuItem(addonId: string, item: NavItem): void {
    this.add("menu", addonId, item);
  }

  /** Setzt fehlende Elemente (wieder) ein; wird über keepInserted aufgerufen */
  render(): void {
    const addonsItem = ensureAddonsItem(this.opts);
    this.renderTabs();
    if (addonsItem) this.renderMenu(addonsItem);
    this.updateActive(this.opts.currentPath());
  }

  updateActive(path: string): void {
    let onTabRoute = false;
    for (const entry of this.entries) {
      const active = "path" in entry.target && entry.target.path === path;
      entry.tab?.classList.toggle("active", active);
      entry.menu?.classList.toggle("active", active);
      if (active && entry.kind === "tab") onTabRoute = true;
    }
    document.documentElement.classList.toggle(TAB_ROUTE_CLASS, onTabRoute);
  }

  /** Labels nach Sprachwechsel neu setzen */
  relocalize(): void {
    for (const entry of this.entries) {
      const label = localize(entry.item.label, this.opts.locale());
      const tabLabel = entry.tab?.querySelector(".tab-label");
      if (tabLabel) tabLabel.textContent = label;
      if (entry.menu) entry.menu.textContent = label;
    }
    this.render();
  }

  private add(kind: Entry["kind"], addonId: string, item: NavItem): void {
    const n = this.counters.get(`${kind}:${addonId}`) ?? 0;
    this.counters.set(`${kind}:${addonId}`, n + 1);
    const testId = kind === "tab" ? `addon-tab-${addonId}-${n}` : `addon-menu-${addonId}-${n}`;
    const target = item.href
      ? { href: item.href }
      : { path: `/addons/${addonId}${item.page ? "/" + item.page.replace(/^\/+/, "") : ""}` };
    this.entries.push({ kind, item, testId, target });
    this.render();
  }

  private renderTabs(): void {
    const tabMore = document.querySelector(`${TAB_BAR} ${TAB_MORE}`);
    if (!tabMore) return;
    for (const entry of this.entries) {
      if (entry.kind !== "tab") continue;
      entry.tab ??= this.createTab(entry);
      if (!entry.tab.isConnected) tabMore.before(entry.tab);
    }
  }

  private renderMenu(addonsItem: HTMLAnchorElement): void {
    if (!document.querySelector(MORE_MENU)) return;
    let anchor: Element = addonsItem;
    for (const entry of this.entries) {
      entry.menu ??= this.createMenuItem(entry, addonsItem);
      if (anchor.nextElementSibling !== entry.menu) anchor.after(entry.menu);
      anchor = entry.menu;
    }
  }

  private createTab(entry: Entry): HTMLAnchorElement {
    const tab = cloneTabItem(document.querySelector(`${TAB_BAR} ${TAB_ITEM}`), {
      label: localize(entry.item.label, this.opts.locale()),
      href: this.href(entry),
      testId: entry.testId,
      iconSvg: entry.item.icon,
    });
    this.bindClick(tab, entry);
    return tab;
  }

  /** Menüeintrag; für Tabs als Spiegel, der nur unter 576 px sichtbar ist */
  private createMenuItem(entry: Entry, template: Element): HTMLAnchorElement {
    const menu = cloneMenuItem(template, {
      label: localize(entry.item.label, this.opts.locale()),
      href: this.href(entry),
      testId: entry.kind === "tab" ? `${entry.testId}-more` : entry.testId,
    });
    if (entry.kind === "tab") menu.classList.add("d-sm-none");
    this.bindClick(menu, entry);
    return menu;
  }

  private href(entry: Entry): string {
    return "path" in entry.target ? "#" + entry.target.path : entry.target.href;
  }

  private bindClick(el: HTMLElement, entry: Entry): void {
    const target = entry.target;
    if (!("path" in target)) return;
    el.addEventListener("click", (event) => {
      event.preventDefault();
      navigate(target.path);
    });
  }
}
