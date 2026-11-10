// Asynchron geladener Wert mit Lade- und Fehlerzustand
import { useEffect, useState } from "preact/hooks";

export type Loadable<T> =
  { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; value: T };

export function useLoadable<T>(load: () => Promise<T>, deps: unknown[]): Loadable<T> {
  const [state, setState] = useState<Loadable<T>>({ kind: "loading" });
  useEffect(() => {
    let active = true;
    load().then(
      (value) => active && setState({ kind: "ready", value }),
      (err: unknown) => active && setState({ kind: "error", message: (err as Error).message }),
    );
    return () => void (active = false);
    // Neu geladen wird nur bei Änderung von deps (wie useEffect)
  }, deps);
  return state;
}
