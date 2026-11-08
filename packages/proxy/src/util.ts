// Kleine Hilfsfunktionen ohne Abhängigkeiten

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Meldung eines fehlgeschlagenen fetch: `fetch failed` sagt nichts, die Ursache steht in `cause` */
export function fetchErrorMessage(err: unknown, timeoutMs: number): string {
  if (err instanceof Error && err.name === "TimeoutError") {
    return `keine Antwort innerhalb von ${timeoutMs / 1000} s`;
  }
  const cause = (err as { cause?: unknown }).cause;
  return cause instanceof Error ? cause.message : errorMessage(err);
}
