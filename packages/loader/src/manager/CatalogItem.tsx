// Eintrag im Modal „Addon hinzufügen“: Name, Version, Beschreibung, Zustand und Installations-Button
import type { CatalogEntry } from "../addons-client.js";
import { localize, t, type MessageKey } from "../i18n.js";
import type { InstallFeedback } from "./InstallForm.js";

export interface CatalogItemProps {
  entry: CatalogEntry;
  locale: string;
  /** Alle Installations-Buttons gesperrt (Installation oder Upload läuft) */
  disabled: boolean;
  /** Dieser Eintrag wird gerade installiert */
  busy: boolean;
  feedback: InstallFeedback | undefined;
  onInstall: () => void;
}

export function CatalogItem(props: CatalogItemProps) {
  const { entry, locale, feedback } = props;
  const status = statusLine(entry, locale);
  return (
    <div class="evcc-addons-catalog-entry" data-testid={`catalog-entry-${entry.id}`}>
      <div class="d-flex justify-content-between align-items-baseline gap-2">
        <strong>{localize(entry.name, locale)}</strong>
        <span class="text-muted small text-nowrap">v{entry.version}</span>
      </div>
      <div class="text-muted small">{localize(entry.description, locale)}</div>
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-2">
        {status && (
          <span class="small text-muted" data-testid="catalog-status">
            {status}
          </span>
        )}
        {actionButton(props)}
      </div>
      {feedback && (
        <div
          class={`small mt-2 ${feedback.kind === "success" ? "text-success" : "text-danger"}`}
          data-testid={`catalog-${feedback.kind}`}
        >
          {feedback.text}
        </div>
      )}
    </div>
  );
}

/** Zustand links unten; bei `available` keiner */
function statusLine(entry: CatalogEntry, locale: string): string | null {
  switch (entry.status) {
    case "installed":
      return t("catalog.installed", locale);
    case "update":
    case "newer-installed":
      return t("catalog.installedVersion", locale, { version: entry.installedVersion ?? "" });
    case "incompatible":
      return t("catalog.incompatible", locale);
    default:
      return null;
  }
}

const ACTIONS: Partial<Record<CatalogEntry["status"], { label: MessageKey; style: string }>> = {
  available: { label: "catalog.install", style: "btn-primary" },
  update: { label: "catalog.update", style: "btn-primary" },
  installed: { label: "catalog.reinstall", style: "btn-outline-secondary" },
};

/** Button rechts unten nach Zustand; `newer-installed` und `incompatible` haben keinen */
function actionButton({ entry, locale, disabled, busy, onInstall }: CatalogItemProps) {
  const action = ACTIONS[entry.status];
  if (!action) return null;
  return (
    <button
      type="button"
      class={`btn btn-sm ${action.style} ms-auto`}
      data-testid="catalog-action"
      disabled={disabled}
      onClick={onInstall}
    >
      {t(busy ? "manager.install.uploading" : action.label, locale)}
    </button>
  );
}
