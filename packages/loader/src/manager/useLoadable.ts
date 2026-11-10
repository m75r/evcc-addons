// Asynchron geladener Wert mit Lade- und Fehlerzustand
import { useEffect, useState } from "preact/hooks";

/** Im Fehlerzustand bleibt der ursprüngliche Fehler erhalten, z. B. für die Erkennung von 401 */
export type Loadable<T> =
  | { kind: "loading" }
  | { kind: "error"; message: string; error: unknown }
  | { kind: "ready"; value: T };

export function useLoadable<T>(load: () => Promise<T>, deps: unknown[]): Loadable<T> {
  const [state, setState] = useState<Loadable<T>>({ kind: "loading" });
  useEffect(() => {
    let active = true;
    load().then(
      (value) => active && setState({ kind: "ready", value }),
      (error: unknown) =>
        active && setState({ kind: "error", message: (error as Error).message, error }),
    );
    return () => void (active = false);
    // Neu geladen wird nur bei Änderung von deps (wie useEffect)
  }, deps);
  return state;
}
