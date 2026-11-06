// Klone vorhandener evcc-Elemente, damit scoped Styles (data-v-*) greifen

const ACTIVE_CLASSES = ["active", "router-link-active", "router-link-exact-active"];

export interface MenuItemSpec {
  label: string;
  href: string;
  testId: string;
}

/** Erzeugt einen Eintrag im Menü „Mehr“ nach dem Vorbild `template` */
export function cloneMenuItem(template: Element | null, spec: MenuItemSpec): HTMLAnchorElement {
  const item = template ? shallowClone(template, "a") : fallbackMenuItem();
  item.setAttribute("href", spec.href);
  item.setAttribute("data-testid", spec.testId);
  item.textContent = spec.label;
  return item;
}

/** Flacher Klon: Attribute (inkl. data-v-*) bleiben, Kinder und Aktiv-Klassen nicht */
export function shallowClone(template: Element, tag: "a"): HTMLAnchorElement {
  const item = document.createElement(tag);
  for (const attr of Array.from(template.attributes)) {
    if (attr.name === "id" || attr.name === "aria-current") continue;
    item.setAttribute(attr.name, attr.value);
  }
  item.classList.remove(...ACTIVE_CLASSES);
  return item;
}

function fallbackMenuItem(): HTMLAnchorElement {
  const item = document.createElement("a");
  item.className = "dropdown-item evcc-addons-fallback";
  return item;
}

export interface TabItemSpec extends MenuItemSpec {
  iconSvg?: string;
}

/** Puzzle-Icon als Standard für Addon-Tabs */
export const DEFAULT_TAB_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M20.5 11H19V7a2 2 0 0 0-2-2h-4V3.5a2.5 2.5 0 0 0-5 0V5H4a2 2 0 0 0-2 2v3.8h1.5a2.7 2.7 0 0 1 0 5.4H2V20a2 2 0 0 0 2 2h3.8v-1.5a2.7 2.7 0 0 1 5.4 0V22H17a2 2 0 0 0 2-2v-4h1.5a2.5 2.5 0 0 0 0-5Z"/></svg>';

/**
 * Erzeugt einen Tab nach dem Vorbild des ersten evcc-Tabs: Struktur
 * `span.tab-content` > Icon + `span.tab-label` bleibt erhalten, sichtbar erst ab 576 px.
 */
export function cloneTabItem(template: Element | null, spec: TabItemSpec): HTMLAnchorElement {
  const tab = template ? shallowClone(template, "a") : fallbackTab();
  tab.classList.remove("d-flex");
  tab.classList.add("d-none", "d-sm-flex");
  tab.setAttribute("href", spec.href);
  tab.setAttribute("data-testid", spec.testId);
  const content = cloneOrCreate(template?.querySelector(".tab-content"), "span", "tab-content");
  const label = cloneOrCreate(template?.querySelector(".tab-label"), "span", "tab-label");
  label.textContent = spec.label;
  content.append(
    createIcon(spec.iconSvg ?? DEFAULT_TAB_ICON, template?.querySelector(".tab-icon")),
    label,
  );
  tab.append(content);
  return tab;
}

function cloneOrCreate(
  template: Element | null | undefined,
  tag: string,
  className: string,
): HTMLElement {
  if (template) {
    const el = template.cloneNode(false) as HTMLElement;
    el.classList.remove(...ACTIVE_CLASSES);
    return el;
  }
  const el = document.createElement(tag);
  el.className = className;
  return el;
}

/** Icon aus SVG-Markup; data-v-* des evcc-Icons werden übernommen */
function createIcon(svg: string, templateIcon: Element | null | undefined): Element {
  const wrapper = document.createElement("span");
  wrapper.innerHTML = svg.trim();
  const icon = wrapper.firstElementChild ?? document.createElement("span");
  icon.classList.add("tab-icon");
  for (const attr of Array.from(templateIcon?.attributes ?? [])) {
    if (attr.name.startsWith("data-v-")) icon.setAttribute(attr.name, attr.value);
  }
  return icon;
}

function fallbackTab(): HTMLAnchorElement {
  const tab = document.createElement("a");
  tab.className =
    "tab-item flex-column flex-md-row align-items-center justify-content-center gap-md-1 text-decoration-none position-relative evcc-addons-fallback-tab";
  return tab;
}
