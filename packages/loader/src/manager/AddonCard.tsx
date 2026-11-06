// Karte eines installierten Addons: Name, Version, Beschreibung, Startfehler, Aktionen
import { useState } from "preact/hooks";
import type { AddonInfo } from "../addons-client.js";
import { localize, t } from "../i18n.js";
import { errorText, isUnauthorized } from "./errors.js";

export interface AddonActions {
  setEnabled: (id: string, enabled: boolean) => Promise<unknown>;
  uninstall: (id: string) => Promise<void>;
  confirm: (message: string) => boolean;
  reload: () => void;
  onUnauthorized: () => void;
}

export interface AddonCardProps {
  addon: AddonInfo;
  locale: string;
  canManage: boolean;
  actions: AddonActions;
}

/** Führt eine Aktion aus; Erfolg lädt neu, Fehler erscheinen auf der Karte */
function useAction(actions: AddonActions, locale: string) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      actions.reload();
    } catch (err) {
      setBusy(false);
      if (isUnauthorized(err)) return actions.onUnauthorized();
      setError(t("manager.actionError", locale, { message: errorText(err, locale) }));
    }
  };
  return { busy, error, run };
}

export function AddonCard({ addon, locale, canManage, actions }: AddonCardProps) {
  const { busy, error, run } = useAction(actions, locale);
  const name = localize(addon.name, locale);
  const uninstall = () => {
    if (actions.confirm(t("manager.uninstall.confirm", locale, { name }))) {
      void run(() => actions.uninstall(addon.id));
    }
  };
  return (
    <div class="round-box mb-3" data-testid={`addon-card-${addon.id}`}>
      <div class="d-flex align-items-start justify-content-between gap-3">
        <div class="flex-grow-1 min-w-0">
          <strong class="d-block text-truncate">{name}</strong>
          {addon.description && (
            <div class="text-muted small">{localize(addon.description, locale)}</div>
          )}
        </div>
        <span class="text-muted small text-nowrap pt-1">v{addon.version}</span>
        <div class="form-check form-switch m-0 pt-1">
          <input
            class="form-check-input"
            type="checkbox"
            role="switch"
            data-testid="addon-toggle"
            checked={addon.enabled}
            disabled={!canManage || busy}
            aria-label={t("manager.enabled", locale)}
            onChange={(e) => void run(() => actions.setEnabled(addon.id, e.currentTarget.checked))}
          />
        </div>
      </div>
      {addon.error && (
        <div class="text-danger small mt-2" data-testid="addon-error">
          ⚠ {t("manager.startError", locale, { message: addon.error })}
        </div>
      )}
      {error && (
        <div class="text-danger small mt-2" data-testid="addon-action-error">
          {error}
        </div>
      )}
      {canManage && (
        <div class="d-flex justify-content-end mt-2">
          <button
            type="button"
            class="btn btn-sm btn-outline-danger"
            data-testid="addon-uninstall"
            disabled={busy}
            onClick={uninstall}
          >
            {t("manager.uninstall", locale)}
          </button>
        </div>
      )}
    </div>
  );
}
