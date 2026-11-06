// Andockpunkte im evcc-DOM (sprachunabhängige Selektoren) und Warten auf Elemente

export const TAB_BAR = '[data-testid="bottom-tab-bar"]';
export const TAB_MORE = '[data-testid="tab-more"]';
export const MORE_MENU = '[data-testid="tab-more"] .more-menu';
export const CONFIG_ITEM = 'a.dropdown-item[href="#/config"]';
export const TAB_ITEM = "a.tab-item";
export const APP_ROOT = "#app";

/** Wartet, bis `selector` im Dokument existiert, sonst Fehler nach `timeoutMs` */
export function waitFor(selector: string, timeoutMs = 30000): Promise<Element> {
  const found = document.querySelector(selector);
  if (found) return Promise.resolve(found);
  return new Promise((resolve, reject) => {
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (!el) return;
      cleanup();
      resolve(el);
    });
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Element ${selector} nicht gefunden (Timeout ${timeoutMs} ms)`));
    }, timeoutMs);
    const cleanup = () => {
      observer.disconnect();
      clearTimeout(timer);
    };
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}
