// Hinweis auf den neuen Pfad /addons-api/ext/switches-tapo/; schließbar, gemerkt per localStorage
import { useState } from "preact/hooks";
import { t } from "../i18n.js";

export const HINT_KEY = "evcc-addon-switches-tapo:ext-hint";

export interface MigrationHintProps {
  locale: string;
  /** Nur für Admins mit mindestens einer Steckdose */
  show: boolean;
  /** null, wenn der Browser keinen Speicher erlaubt (der Hinweis erscheint dann jedes Mal) */
  storage: Storage | null;
}

function isDismissed(storage: Storage | null): boolean {
  try {
    return storage?.getItem(HINT_KEY) === "dismissed";
  } catch {
    // Gesperrter Speicher (z. B. privates Fenster): Hinweis anzeigen
    return false;
  }
}

function remember(storage: Storage | null): void {
  try {
    storage?.setItem(HINT_KEY, "dismissed");
  } catch {
    // Ohne Speicher gilt das Schließen nur bis zum Neuladen
  }
}

export function MigrationHint({ locale, show, storage }: MigrationHintProps) {
  const [dismissed, setDismissed] = useState(() => isDismissed(storage));
  if (!show || dismissed) return null;
  const close = () => {
    remember(storage);
    setDismissed(true);
  };
  return (
    <div
      class="alert alert-info d-flex align-items-start gap-2 small"
      data-testid="switches-migration-hint"
    >
      <span class="flex-grow-1">ⓘ {t("switches.hint.ext", locale)}</span>
      <button
        type="button"
        class="btn-close"
        data-testid="switches-migration-hint-close"
        aria-label={t("switches.hint.close", locale)}
        onClick={close}
      />
    </div>
  );
}

/** localStorage, falls der Zugriff erlaubt ist */
export function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
