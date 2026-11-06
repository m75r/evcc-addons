// Fehler des Loaders selbst; sie erscheinen auf der Seite „Addons“ (keine Konsolenausgabe)

const coreErrors: string[] = [];
const listeners = new Set<() => void>();

export function reportCoreError(context: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  coreErrors.push(`${context}: ${message}`);
  for (const listener of listeners) listener();
}

export function getCoreErrors(): readonly string[] {
  return coreErrors;
}

export function onCoreErrors(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
