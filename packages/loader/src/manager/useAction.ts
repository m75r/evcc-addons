// Aktion einer Karte: Erfolg lädt neu, 401 zeigt das Login, sonst erscheint der Fehler auf der Karte
import { useState } from "preact/hooks";
import { t } from "../i18n.js";
import { errorText, isUnauthorized } from "./errors.js";

export interface ActionCallbacks {
  reload: () => void;
  onUnauthorized: () => void;
}

export function useAction(callbacks: ActionCallbacks, locale: string) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setBusy(false);
      callbacks.reload();
    } catch (err) {
      setBusy(false);
      if (isUnauthorized(err)) return callbacks.onUnauthorized();
      setError(t("manager.actionError", locale, { message: errorText(err, locale) }));
    }
  };
  return { busy, error, run };
}
