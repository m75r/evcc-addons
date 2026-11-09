// Fehler des Gateways; routes.ts übersetzt sie mit server.httpError in HTTP-Antworten

/** Ungültige Eingabe, `field` nennt das betroffene Feld (→ 400 switch-invalid) */
export class SwitchInputError extends Error {
  override name = "SwitchInputError";

  constructor(
    message: string,
    readonly field: string,
  ) {
    super(message);
  }
}

/** Unbekannte Steckdose (→ 404 not-found) */
export class SwitchNotFoundError extends Error {
  override name = "SwitchNotFoundError";

  constructor(readonly id: string) {
    super(`Steckdose ${id} gibt es nicht`);
  }
}

/** ⏻ für eine Steckdose mit Ladepunkt-Bindung (→ 409 target-not-consumer) */
export class SwitchTargetError extends Error {
  override name = "SwitchTargetError";

  constructor() {
    super("Diese Steckdose schaltet evcc über den Ladepunkt.");
  }
}
