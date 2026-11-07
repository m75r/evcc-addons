// Modal „Einstellungen <Name>“ im Markup von evcc GenericModal (ohne Bootstrap-JS)
import type { SettingValue, SettingValues } from "@evcc-addons/sdk";
import type { RefObject } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { ApiError, type AddonInfo, type SessionReason } from "../addons-client.js";
import { localize, t, type MessageKey } from "../i18n.js";
import { errorText, isUnauthorized } from "./errors.js";
import { SettingField } from "./SettingField.js";

export interface SettingsModalProps {
  addon: AddonInfo;
  values: SettingValues;
  locale: string;
  canManage: boolean;
  reason: SessionReason | null;
  /** Speichert; bei Erfolg schließt der Aufrufer das Modal */
  save: (values: SettingValues) => Promise<void>;
  onClose: () => void;
  onUnauthorized: () => void;
}

/** Speichern mit Fehleranzeige; bei 401 schließt das Modal und das Login-Formular erscheint */
function useSaveSettings(props: SettingsModalProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (draft: SettingValues) => {
    setBusy(true);
    setError(null);
    try {
      await props.save(draft);
    } catch (err) {
      setBusy(false);
      if (!isUnauthorized(err)) return setError(saveErrorText(err, props.locale));
      props.onClose();
      props.onUnauthorized();
    }
  };
  return { busy, error, submit };
}

function saveErrorText(err: unknown, locale: string): string {
  if (err instanceof ApiError && err.code === "too-large") {
    return t("manager.settings.tooLarge", locale);
  }
  return t("manager.settings.error", locale, { message: errorText(err, locale) });
}

/** `body.modal-open` wie Bootstrap, Fokus auf den Dialog */
function useModalEffects(dialog: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    document.body.classList.add("modal-open");
    dialog.current?.focus();
    return () => document.body.classList.remove("modal-open");
  }, []);
}

export function SettingsModal(props: SettingsModalProps) {
  const { addon, locale } = props;
  const dialog = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<SettingValues>(() => ({ ...props.values }));
  const { busy, error, submit } = useSaveSettings(props);
  useModalEffects(dialog);
  const close = () => !busy && props.onClose();
  const titleId = `addon-settings-title-${addon.id}`;
  return (
    <>
      <div
        ref={dialog}
        class="modal fade show d-block"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid="addon-settings-modal"
        onKeyDown={(e) => e.key === "Escape" && close()}
        onClick={(e) => e.target === e.currentTarget && close()}
      >
        <div class="modal-dialog modal-dialog-centered" role="document">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id={titleId}>
                {t("manager.settings.title", locale, { name: localize(addon.name, locale) })}
              </h5>
              <button
                type="button"
                class="btn-close"
                data-testid="addon-settings-close"
                aria-label={t("manager.settings.close", locale)}
                onClick={close}
              />
            </div>
            <div class="modal-body">
              <SettingsFields
                {...props}
                draft={draft}
                disabled={!props.canManage || busy}
                onChange={(key, value) => setDraft((prev) => ({ ...prev, [key]: value }))}
              />
              <SettingsFooter
                {...props}
                busy={busy}
                error={error}
                onSave={() => void submit(draft)}
                onCancel={close}
              />
            </div>
          </div>
        </div>
      </div>
      <div class="modal-backdrop fade show" />
    </>
  );
}

interface FieldsProps extends SettingsModalProps {
  draft: SettingValues;
  disabled: boolean;
  onChange: (key: string, value: SettingValue) => void;
}

function SettingsFields({ addon, locale, draft, disabled, onChange }: FieldsProps) {
  return (
    <>
      {addon.settings.map((def) => (
        <SettingField
          key={def.key}
          addonId={addon.id}
          def={def}
          value={draft[def.key]}
          disabled={disabled}
          locale={locale}
          onChange={(value) => onChange(def.key, value)}
        />
      ))}
    </>
  );
}

interface FooterProps extends SettingsModalProps {
  busy: boolean;
  error: string | null;
  onSave: () => void;
  onCancel: () => void;
}

function SettingsFooter({ locale, canManage, reason, busy, error, onSave, onCancel }: FooterProps) {
  return (
    <>
      {!canManage && (
        <p class="text-muted small" data-testid="addon-settings-readonly">
          {readonlyText(reason, locale)}
        </p>
      )}
      {error && (
        <div class="text-danger small mb-3" data-testid="addon-settings-error">
          ⚠ {error}
        </div>
      )}
      <div class="d-flex justify-content-end gap-2">
        <button
          type="button"
          class="btn btn-link text-muted"
          data-testid="addon-settings-cancel"
          disabled={busy}
          onClick={onCancel}
        >
          {t(canManage ? "manager.settings.cancel" : "manager.settings.close", locale)}
        </button>
        {canManage && (
          <button
            type="button"
            class="btn btn-primary"
            data-testid="addon-settings-save"
            disabled={busy}
            onClick={onSave}
          >
            {t(busy ? "manager.settings.saving" : "manager.settings.save", locale)}
          </button>
        )}
      </div>
    </>
  );
}

/** Ohne Login der Hinweis zum Anmelden, sonst der passende Sitzungshinweis */
function readonlyText(reason: SessionReason | null, locale: string): string {
  if (reason === null || reason === "login-required") return t("manager.settings.readonly", locale);
  return t(`session.${reason}` as MessageKey, locale);
}
