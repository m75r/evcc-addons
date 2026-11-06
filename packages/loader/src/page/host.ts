// Seiten-Host außerhalb von #app: mountet Seiten passend zur Route unter #/addons
import { APP_ROOT } from "../dom/anchors.js";
import { t } from "../i18n.js";
import { documentTitle } from "./title.js";

export const PAGE_ID = "evcc-addons-page";
export const PAGE_ROUTE_CLASS = "evcc-addons-page-route";
const ADDONS_ROOT = "/addons";

export type Cleanup = () => void;
export type MountFn = (el: HTMLElement, subPath: string) => void | Cleanup;

export interface PageRegistration {
  /** `true`: nur genau dieser Pfad, sonst auch Unterpfade (`<pattern>/…`) */
  exact?: boolean;
  /** Titel für Browser-Tab und Kopfzeile im evcc-Stil */
  title?: () => string;
  /** `false`: Die Seite rendert ihre Kopfzeile selbst (Standard: Kopfzeile, wenn `title` gesetzt) */
  header?: boolean;
  onError?: (err: unknown) => void;
}

interface Entry extends PageRegistration {
  pattern: string;
  mount: MountFn;
}

export class PageHost {
  readonly container: HTMLDivElement;
  private readonly entries: Entry[] = [];
  private cleanup: { fn: Cleanup; entry: Entry } | undefined;
  private currentPath: string | undefined;
  private ready = false;

  constructor(private readonly locale: () => string) {
    this.container = document.createElement("div");
    this.container.id = PAGE_ID;
    this.container.className = "container px-4 safe-area-inset";
    this.container.hidden = true;
  }

  /** Fügt den Container direkt nach #app ein (bzw. wieder ein) */
  attach(): void {
    if (this.container.isConnected) return;
    const app = document.querySelector(APP_ROOT);
    if (app) app.after(this.container);
    else document.body.append(this.container);
  }

  /** Bis alle Addons geladen sind, zeigen unbekannte Addon-Pfade noch kein „nicht gefunden“ */
  setReady(): void {
    this.ready = true;
    if (this.currentPath !== undefined) this.show(this.currentPath, true);
  }

  register(pattern: string, mount: MountFn, opts: PageRegistration = {}): void {
    this.entries.push({ pattern, mount, ...opts });
    // Längere Muster zuerst, damit spezifische Seiten gewinnen
    this.entries.sort((a, b) => b.pattern.length - a.pattern.length);
  }

  /** Zeigt die Seite zu `path` an; gleiche Pfade werden nicht neu gemountet */
  show(path: string, force = false): void {
    if (path === this.currentPath && !force) return;
    this.currentPath = path;
    this.unmount();
    const match = this.match(path);
    const isAddonsRoute = path === ADDONS_ROOT || path.startsWith(ADDONS_ROOT + "/");
    if (!match && !isAddonsRoute) return this.setVisible(false);
    this.setVisible(true);
    window.scrollTo(0, 0);
    if (match) this.mountEntry(match.entry, match.subPath);
    else if (this.ready) this.renderMessage(t("page.notFound", this.locale()));
    documentTitle.set(this.titleFor(match?.entry));
  }

  private match(path: string): { entry: Entry; subPath: string } | undefined {
    for (const entry of this.entries) {
      if (path === entry.pattern) return { entry, subPath: "" };
      if (!entry.exact && path.startsWith(entry.pattern + "/")) {
        return { entry, subPath: path.slice(entry.pattern.length + 1) };
      }
    }
    return undefined;
  }

  private titleFor(entry: Entry | undefined): string {
    if (entry?.title) return entry.title();
    return t(this.ready ? "page.notFound" : "addons.title", this.locale());
  }

  private mountEntry(entry: Entry, subPath: string): void {
    const el = document.createElement("div");
    const header = entry.title && entry.header !== false ? [pageHeader(entry.title())] : [];
    this.container.replaceChildren(...header, el);
    try {
      const cleanup = entry.mount(el, subPath);
      if (typeof cleanup === "function") this.cleanup = { fn: cleanup, entry };
    } catch (err) {
      this.renderMessage(`${t("page.mountError", this.locale())} ${errorText(err)}`, true);
      entry.onError?.(err);
    }
  }

  private unmount(): void {
    const cleanup = this.cleanup;
    this.cleanup = undefined;
    try {
      cleanup?.fn();
    } catch (err) {
      // Fehler beim Aufräumen gehören zur verlassenen Seite
      cleanup?.entry.onError?.(err);
    }
    this.container.replaceChildren();
  }

  private setVisible(visible: boolean): void {
    if (!visible) documentTitle.set(null);
    this.container.hidden = !visible;
    document.documentElement.classList.toggle(PAGE_ROUTE_CLASS, visible);
  }

  private renderMessage(text: string, isError = false): void {
    const box = document.createElement("div");
    box.className = isError ? "alert alert-danger my-4" : "py-5 text-center text-muted";
    box.setAttribute("data-testid", isError ? "addons-page-error" : "addons-page-not-found");
    box.textContent = text;
    this.container.replaceChildren(box);
  }
}

/** Kopfzeile wie evcc TopHeader */
function pageHeader(title: string): HTMLElement {
  const header = document.createElement("header");
  header.className = "d-flex justify-content-between align-items-center py-3 py-md-4";
  const wrapper = document.createElement("div");
  wrapper.className = "title position-relative flex-grow-1 mb-1";
  const h1 = document.createElement("h1");
  h1.className = "mb-0 pt-1 text-truncate";
  h1.textContent = title;
  wrapper.append(h1);
  header.append(wrapper);
  return header;
}

export function errorText(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}
