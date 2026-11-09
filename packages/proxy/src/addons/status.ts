// Startfehler der Addons (nur im Speicher): vom Loader im Browser und vom Server-Teil im Proxy

const MAX_MESSAGE_LENGTH = 2000;

export interface StatusReport {
  ok: boolean;
  message?: string;
}

export class StatusRegistry {
  private readonly browserErrors = new Map<string, string>();
  private readonly serverErrors = new Map<string, string>();

  /** Meldung des Browsers: `ok: true` löscht nur den Browser-Fehler */
  report(id: string, report: StatusReport): void {
    if (report.ok) {
      this.browserErrors.delete(id);
      return;
    }
    this.browserErrors.set(id, truncate(report.message ?? "Unbekannter Fehler"));
  }

  /** Meldung des Server-Teils; `null` löscht den Server-Fehler */
  reportServer(id: string, message: string | null): void {
    if (message === null) this.serverErrors.delete(id);
    else this.serverErrors.set(id, truncate(message));
  }

  /** Der Server-Fehler hat Vorrang, weil der Browser ihn nicht beheben kann */
  get(id: string): string | null {
    return this.serverErrors.get(id) ?? this.browserErrors.get(id) ?? null;
  }

  clear(id: string): void {
    this.browserErrors.delete(id);
    this.serverErrors.delete(id);
  }
}

function truncate(message: string): string {
  return message.slice(0, MAX_MESSAGE_LENGTH);
}
