// Karte eines installierten Addons: Name, Version, Beschreibung, Startfehler, Aktionen
import type { SettingValues } from "@evcc-addons/sdk";
import { useState } from "preact/hooks";
import type { AddonInfo, SessionReason } from "../addons-client.js";
import { localize, t } from "../i18n.js";
import { ADJUST_ICON } from "../icons.js";
import { AddonDialog } from "./AddonDialog.js";
import type { ManagerDialogEntry } from "./dialogs.js";
import { SettingsModal } from "./SettingsModal.js";
import { useAction } from "./useAction.js";

export interface AddonActions {
  setEnabled: (id: string, enabled: boolean) => Promise<unknown>;
  uninstall: (id: string) => Promise<void>;
  saveSettings: (id: string, values: SettingValues) => Promise<AddonInfo>;
  /** Erhält das vom Proxy zurückgegebene DTO nach dem Speichern */
  onSettingsSaved: (addon: AddonInfo) => void;
  confirm: (message: string) => boolean;
  reload: () => void;
  onUnauthorized: () => void;
}

export interface AddonCardProps {
  addon: AddonInfo;
  locale: string;
  canManage: boolean;
  reason: SessionReason | null;
  actions: AddonActions;
  /** Dialoge aus api.addManagerDialog, nur bei aktivem Addon sichtbar */
  dialogs: ManagerDialogEntry[];
}

/** Aktuelle Werte und Modal; Speichern ohne Neuladen, Fehler behandelt das Modal */
function useSettingsModal(addon: AddonInfo, actions: AddonActions) {
  const [values, setValues] = useState<SettingValues>(addon.settingValues);
  const [open, setOpen] = useState(false);
  const save = (draft: SettingValues): Promise<void> =>
    actions.saveSettings(addon.id, draft).then((saved) => {
      setValues(saved.settingValues);
      actions.onSettingsSaved(saved);
      setOpen(false);
    });
  return { values, open, setOpen, save };
}

export function AddonCard(props: AddonCardProps) {
  const { addon, locale, canManage, actions } = props;
  const { busy, error, run } = useAction(actions, locale);
  const settings = useSettingsModal(addon, actions);
  const [openDialog, setOpenDialog] = useState<number | null>(null);
  const name = localize(addon.name, locale);
  const uninstall = () => {
    if (actions.confirm(uninstallMessage(addon, name, locale))) {
      void run(() => actions.uninstall(addon.id));
    }
  };
  return (
    <div class="round-box mb-3" data-testid={`addon-card-${addon.id}`}>
      <CardHeader
        {...props}
        busy={busy}
        onToggle={(enabled) => void run(() => actions.setEnabled(addon.id, enabled))}
        openDialog={openDialog}
        onOpenDialog={setOpenDialog}
        onOpenSettings={() => settings.setOpen(true)}
      />
      <CardMessages addon={addon} locale={locale} actionError={error} />
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
      {settings.open && (
        <SettingsModal
          {...props}
          values={settings.values}
          save={settings.save}
          onClose={() => settings.setOpen(false)}
          onUnauthorized={actions.onUnauthorized}
        />
      )}
      {openDialog !== null && props.dialogs[openDialog] && (
        <AddonDialog
          addonId={addon.id}
          index={openDialog}
          entry={props.dialogs[openDialog]}
          locale={locale}
          canManage={canManage}
          confirm={actions.confirm}
          onUnauthorized={actions.onUnauthorized}
          onClose={() => setOpenDialog(null)}
        />
      )}
    </div>
  );
}

/** Rückfrage beim Deinstallieren, mit Hinweis auf gespeicherte Daten */
function uninstallMessage(addon: AddonInfo, name: string, locale: string): string {
  const question = t("manager.uninstall.confirm", locale, { name });
  return addon.hasData ? `${question} ${t("manager.uninstall.confirmData", locale)}` : question;
}

interface CardHeaderProps extends AddonCardProps {
  busy: boolean;
  onToggle: (enabled: boolean) => void;
  openDialog: number | null;
  onOpenDialog: (index: number) => void;
  onOpenSettings: () => void;
}

function CardHeader(props: CardHeaderProps) {
  const { addon, locale, canManage, busy, onToggle, onOpenSettings } = props;
  return (
    <div class="d-flex align-items-start justify-content-between gap-3">
      <div class="flex-grow-1 min-w-0">
        <div class="d-flex align-items-baseline gap-2 min-w-0">
          <strong class="text-truncate">{localize(addon.name, locale)}</strong>
          <span class="text-muted small text-nowrap" data-testid="addon-version">
            v{addon.version}
          </span>
        </div>
        {addon.description && (
          <div class="text-muted small">{localize(addon.description, locale)}</div>
        )}
      </div>
      {addon.enabled && <DialogButtons {...props} />}
      {addon.settings.length > 0 && <SettingsButton locale={locale} onClick={onOpenSettings} />}
      <div class="form-check form-switch m-0 pt-1">
        <input
          class="form-check-input"
          type="checkbox"
          role="switch"
          data-testid="addon-toggle"
          checked={addon.enabled}
          disabled={!canManage || busy}
          aria-label={t("manager.enabled", locale)}
          onChange={(e) => onToggle(e.currentTarget.checked)}
        />
      </div>
    </div>
  );
}

/** Ein Icon-Button je Dialog des Addons, links neben ⚙ */
function DialogButtons({ dialogs, locale, openDialog, onOpenDialog }: CardHeaderProps) {
  return (
    <>
      {dialogs.map((entry, index) => {
        const label = localize(entry.def.label, locale);
        return (
          <button
            key={index}
            type="button"
            class="btn btn-sm btn-outline-secondary border-0 p-2 evcc-gray evcc-addons-settings-btn"
            data-testid={`addon-dialog-${index}`}
            aria-label={label}
            aria-expanded={openDialog === index}
            title={label}
            onClick={() => onOpenDialog(index)}
            dangerouslySetInnerHTML={{ __html: entry.def.icon }}
          />
        );
      })}
    </>
  );
}

/** Icon-Button wie evcc Loadpoints/SettingsButton (shopicon „adjust“) */
function SettingsButton({ locale, onClick }: { locale: string; onClick: () => void }) {
  return (
    <button
      type="button"
      class="btn btn-sm btn-outline-secondary border-0 p-2 evcc-gray evcc-addons-settings-btn"
      data-testid="addon-settings"
      aria-label={t("manager.settings", locale)}
      title={t("manager.settings", locale)}
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: ADJUST_ICON }}
    />
  );
}

interface CardMessagesProps {
  addon: AddonInfo;
  locale: string;
  actionError: string | null;
}

function CardMessages({ addon, locale, actionError }: CardMessagesProps) {
  return (
    <>
      {addon.error && (
        <div class="text-danger small mt-2" data-testid="addon-error">
          ⚠ {t("manager.startError", locale, { message: addon.error })}
        </div>
      )}
      {actionError && (
        <div class="text-danger small mt-2" data-testid="addon-action-error">
          {actionError}
        </div>
      )}
    </>
  );
}
