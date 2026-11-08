// Modal „Steckdose hinzufügen“ / „Steckdose bearbeiten“
import type { InputHTMLAttributes, JSX } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { SwitchInfo, SwitchInput } from "../addons-client.js";
import { t, type MessageKey } from "../i18n.js";
import { errorText, isUnauthorized } from "./errors.js";
import { Modal } from "./Modal.js";

export interface SwitchModalProps {
  locale: string;
  /** null = neu anlegen */
  initial: SwitchInfo | null;
  loadTitles: () => Promise<string[]>;
  save: (input: SwitchInput) => Promise<SwitchInfo>;
  /** `changed`: es wurde gespeichert, die Liste muss neu geladen werden */
  onClose: (changed: boolean) => void;
  onUnauthorized: () => void;
}

type Titles =
  { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; list: string[] };

function initialDraft(initial: SwitchInfo | null): SwitchInput {
  return {
    name: initial?.name ?? "",
    type: initial?.type ?? "tapo",
    host: initial?.host ?? "",
    user: initial?.user ?? "",
    password: "",
    loadpoint: initial?.loadpoint ?? "",
  };
}

/** Lädt die Ladepunkt-Titel; beim Anlegen wird der erste vorausgewählt */
function useTitles(props: SwitchModalProps, setDefault: (title: string) => void): Titles {
  const [titles, setTitles] = useState<Titles>({ kind: "loading" });
  useEffect(() => {
    props.loadTitles().then(
      (list) => {
        setTitles({ kind: "ready", list });
        if (list.length > 0) setDefault(list[0]);
      },
      (err: unknown) => setTitles({ kind: "error", message: errorText(err, props.locale) }),
    );
  }, []);
  return titles;
}

/** Speichern; ein Verbindungsfehler lässt das Modal mit Hinweis offen */
function useSubmit(props: SwitchModalProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const submit = async (draft: SwitchInput) => {
    setBusy(true);
    setError(null);
    try {
      const saved = await props.save(draft);
      setBusy(false);
      if (saved.status.reachable !== false) return props.onClose(true);
      const message = saved.status.error ?? "";
      setWarning(t("switches.saved.unreachable", props.locale, { message }));
    } catch (err) {
      setBusy(false);
      if (!isUnauthorized(err)) {
        return setError(
          t("manager.settings.error", props.locale, { message: errorText(err, props.locale) }),
        );
      }
      props.onClose(false);
      props.onUnauthorized();
    }
  };
  return { busy, error, warning, submit };
}

export function SwitchModal(props: SwitchModalProps) {
  const { locale, initial } = props;
  const [draft, setDraft] = useState<SwitchInput>(() => initialDraft(initial));
  const update = (change: Partial<SwitchInput>) => setDraft((prev) => ({ ...prev, ...change }));
  const titles = useTitles(props, (title) =>
    setDraft((prev) => (prev.loadpoint === "" ? { ...prev, loadpoint: title } : prev)),
  );
  const { busy, error, warning, submit } = useSubmit(props);
  const saved = warning !== null;
  const close = () => !busy && props.onClose(saved);
  return (
    <Modal
      title={t(initial ? "switches.modal.edit" : "switches.modal.create", locale)}
      titleId="switch-modal-title"
      testId="switch-modal"
      closeTestId="switch-modal-close"
      closeLabel={t("manager.settings.close", locale)}
      onClose={close}
    >
      <SwitchFields
        locale={locale}
        draft={draft}
        editing={initial !== null}
        titles={titles}
        disabled={busy || saved}
        onChange={update}
      />
      <ModalFooter
        locale={locale}
        busy={busy}
        saved={saved}
        message={warning ?? error}
        onSave={() => void submit(draft)}
        onCancel={close}
      />
    </Modal>
  );
}

interface FieldsProps {
  locale: string;
  draft: SwitchInput;
  editing: boolean;
  titles: Titles;
  disabled: boolean;
  onChange: (change: Partial<SwitchInput>) => void;
}

function SwitchFields({ locale, draft, editing, titles, disabled, onChange }: FieldsProps) {
  const text = (
    key: "name" | "host" | "user",
    extra: InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <input
      {...extra}
      id={`switch-field-${key}`}
      class="form-control form-control-sm"
      data-testid={`switch-field-${key}`}
      value={draft[key]}
      disabled={disabled}
      onInput={(e) => onChange({ [key]: e.currentTarget.value })}
    />
  );
  return (
    <>
      <FormRow locale={locale} field="name">
        {text("name", { maxLength: 60 })}
      </FormRow>
      <FormRow locale={locale} field="type">
        <select
          id="switch-field-type"
          class="form-select form-select-sm"
          data-testid="switch-field-type"
          value={draft.type}
          disabled={disabled}
        >
          <option value="tapo">{t("switches.type.tapo", locale)}</option>
        </select>
      </FormRow>
      <FormRow locale={locale} field="host">
        {text("host", { placeholder: "192.168.1.50", inputMode: "url" })}
      </FormRow>
      <FormRow locale={locale} field="user">
        {text("user", { type: "email", autoComplete: "off" })}
      </FormRow>
      <FormRow locale={locale} field="password">
        <input
          id="switch-field-password"
          type="password"
          class="form-control form-control-sm"
          data-testid="switch-field-password"
          autoComplete="new-password"
          placeholder={editing ? t("switches.password.keep", locale) : ""}
          value={draft.password}
          disabled={disabled}
          onInput={(e) => onChange({ password: e.currentTarget.value })}
        />
      </FormRow>
      <FormRow locale={locale} field="loadpoint">
        <LoadpointInput
          locale={locale}
          value={draft.loadpoint}
          titles={titles}
          disabled={disabled}
          onChange={(loadpoint) => onChange({ loadpoint })}
        />
      </FormRow>
    </>
  );
}

function FormRow(props: { locale: string; field: string; children: JSX.Element }) {
  return (
    <div class="mb-3 row">
      <label class="col-sm-4 col-form-label col-form-label-sm" for={`switch-field-${props.field}`}>
        {t(`switches.field.${props.field}` as MessageKey, props.locale)}
      </label>
      <div class="col-sm-8">{props.children}</div>
    </div>
  );
}

interface LoadpointProps {
  locale: string;
  value: string;
  titles: Titles;
  disabled: boolean;
  onChange: (title: string) => void;
}

/** Auswahl aus evcc; ein nicht mehr vorhandener Titel bleibt wählbar, ohne evcc ein Textfeld */
function LoadpointInput({ locale, value, titles, disabled, onChange }: LoadpointProps) {
  if (titles.kind === "error") {
    return (
      <>
        <input
          id="switch-field-loadpoint"
          class="form-control form-control-sm"
          data-testid="switch-field-loadpoint"
          value={value}
          disabled={disabled}
          onInput={(e) => onChange(e.currentTarget.value)}
        />
        <div class="form-text" data-testid="switch-loadpoints-error">
          {t("switches.loadpoint.unavailable", locale, { message: titles.message })}
        </div>
      </>
    );
  }
  const list = titles.kind === "ready" ? [...new Set(titles.list)] : [];
  const missing = value !== "" && titles.kind === "ready" && !list.includes(value);
  return (
    <select
      id="switch-field-loadpoint"
      class="form-select form-select-sm"
      data-testid="switch-field-loadpoint"
      value={value}
      disabled={disabled || titles.kind === "loading"}
      onChange={(e) => onChange(e.currentTarget.value)}
    >
      {titles.kind === "loading" && (
        <option value={value}>{t("switches.loadpoint.loading", locale)}</option>
      )}
      {missing && (
        <option value={value}>{t("switches.loadpoint.notFound", locale, { title: value })}</option>
      )}
      {list.map((title) => (
        <option key={title} value={title}>
          {title}
        </option>
      ))}
    </select>
  );
}

interface FooterProps {
  locale: string;
  busy: boolean;
  /** Gespeichert mit Verbindungsfehler: nur noch „Schließen“ */
  saved: boolean;
  message: string | null;
  onSave: () => void;
  onCancel: () => void;
}

function ModalFooter({ locale, busy, saved, message, onSave, onCancel }: FooterProps) {
  return (
    <>
      {message && (
        <div
          class="text-danger small mb-3"
          data-testid={saved ? "switch-modal-warning" : "switch-modal-error"}
        >
          ⚠ {message}
        </div>
      )}
      <div class="d-flex justify-content-end gap-2">
        <button
          type="button"
          class="btn btn-link text-muted"
          data-testid="switch-modal-cancel"
          disabled={busy}
          onClick={onCancel}
        >
          {t(saved ? "manager.settings.close" : "manager.settings.cancel", locale)}
        </button>
        {!saved && (
          <button
            type="button"
            class="btn btn-primary"
            data-testid="switch-modal-save"
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
