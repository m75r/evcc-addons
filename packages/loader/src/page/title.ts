// Titel des Browser-Tabs auf Addon-Seiten (evcc setzt dort sonst „... | evcc“)

/** Wie evcc App.vue: `%s | <Marke>` */
export function formatTitle(title: string): string {
  return `${title} | ${window.evcc?.customBrand || "evcc"}`;
}

/**
 * Hält den Tab-Titel, solange eine Addon-Seite sichtbar ist. evcc (unhead) schreibt den Titel
 * nach Routenwechseln asynchron neu, daher wird er bei jeder Änderung im <head> wieder gesetzt.
 */
export class DocumentTitle {
  private desired: string | null = null;
  private readonly observer = new MutationObserver(() => this.apply());

  set(title: string | null): void {
    this.desired = title === null ? null : formatTitle(title);
    if (this.desired === null) {
      this.observer.disconnect();
      return;
    }
    this.observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    this.apply();
  }

  private apply(): void {
    if (this.desired !== null && document.title !== this.desired) document.title = this.desired;
  }
}

/** Eine gemeinsame Instanz, damit nie zwei Wächter verschiedene Titel durchsetzen */
export const documentTitle = new DocumentTitle();
