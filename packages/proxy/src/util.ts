// Kleine Hilfsfunktionen ohne Abhängigkeiten

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
