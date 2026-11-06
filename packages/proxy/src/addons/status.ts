// Startfehler der Addons (nur im Speicher, gemeldet vom Loader im Browser)

const MAX_MESSAGE_LENGTH = 2000;

export interface StatusReport {
  ok: boolean;
  message?: string;
}

export class StatusRegistry {
  private readonly errors = new Map<string, string>();

  /** `ok: true` löscht den Fehler, sonst wird die (gekürzte) Meldung gespeichert */
  report(id: string, report: StatusReport): void {
    if (report.ok) {
      this.errors.delete(id);
      return;
    }
    const message = (report.message ?? "Unbekannter Fehler").slice(0, MAX_MESSAGE_LENGTH);
    this.errors.set(id, message);
  }

  get(id: string): string | null {
    return this.errors.get(id) ?? null;
  }

  clear(id: string): void {
    this.errors.delete(id);
  }
}
