// Formular „Steckdose hinzufügen“ / „Steckdose bearbeiten“, zweite Ansicht im Dialog „Tapo-Steckdosen“
// (aus packages/loader/src/manager/SwitchModal.tsx, ohne eigenes Modal und ohne Typ-Feld)
import type { InputHTMLAttributes, JSX } from "preact";
import { useEffect, useState } from "preact/hooks";
import { t, type MessageKey } from "../i18n.js";
import { errorText, isUnauthorized } from "../ui/errors.js";
import type { DeviceHosts, EvccDevices, SwitchInfo, SwitchInput, SwitchTarget } from "./client.js";
import { TargetSelect, type Devices } from "./TargetSelect.js";

export interface SwitchFormProps {
  locale: string;
  /** null = neu anlegen */
  initial: SwitchInfo | null;
  loadDevices: () => Promise<EvccDevices>;
  /** Adresse der Tapo-Steckdose je Gerät aus der evcc-Konfiguration */
  loadHosts: () => Promise<DeviceHosts>;
  save: (input: SwitchInput) => Promise<SwitchInfo>;
  /** Zurück zur Liste; `changed`: es wurde gespeichert, die Liste muss neu geladen werden */
  onBack: (changed: boolean) => void;
  onUnauthorized: () => void;
}

function initialDraft(initial: SwitchInfo | null): SwitchInput {
  return {
    name: initial?.name ?? "",
    type: "tapo",
    host: initial?.host ?? "",
    user: initial?.user ?? "",
    password: "",
    target: initial ? { ...initial.target } : { kind: "loadpoint", title: "" },
  };
}

/** Lädt Ladepunkte und Verbraucher für die Auswahl */
function useDevices(props: SwitchFormProps): Devices {
  const [devices, setDevices] = useState<Devices>({ kind: "loading" });
  useEffect(() => {
    props.loadDevices().then(
      (value) => setDevices({ kind: "ready", value }),
      (err: unknown) => setDevices({ kind: "error", message: errorText(err) }),
    );
  }, []);
  return devices;
}

const NO_HOSTS: DeviceHosts = { loadpoint: {}, consumer: {} };

/** Adressen je Gerät; ohne Zugriff auf die evcc-Konfiguration bleibt die Zuordnung leer */
function useHosts(props: SwitchFormProps): DeviceHosts {
  const [hosts, setHosts] = useState<DeviceHosts>(NO_HOSTS);
  useEffect(() => {
    props.loadHosts().then(setHosts, () => {
      // Kein Fehlerfall für das Formular: Die Adresse wird dann von Hand eingetragen
      setHosts(NO_HOSTS);
    });
  }, []);
  return hosts;
}

const NAME_MAX = 60;

/** Auswahl eines Geräts übernimmt dessen Titel als Name und, falls bekannt, die Adresse */
function useTargetChoice(props: SwitchFormProps, update: (change: Partial<SwitchInput>) => void) {
  const devices = useDevices(props);
  const hosts = useHosts(props);
  const [hostMissing, setHostMissing] = useState(false);
  const choose = (target: SwitchTarget) => {
    const host = hosts[target.kind][target.title];
    update({ target, name: target.title.slice(0, NAME_MAX), ...(host ? { host } : {}) });
    setHostMissing(target.title !== "" && !host);
  };
  return { devices, hostMissing, choose };
}

/** Speichern; ein Verbindungsfehler lässt das Formular mit Hinweis offen */
function useSubmit(props: SwitchFormProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const submit = async (draft: SwitchInput) => {
    setBusy(true);
    setError(null);
    try {
      const saved = await props.save(draft);
      setBusy(false);
      if (saved.status.reachable !== false) return props.onBack(true);
      const message = saved.status.error ?? "";
      setWarning(t("switches.saved.unreachable", props.locale, { message }));
    } catch (err) {
      setBusy(false);
      if (!isUnauthorized(err)) {
        return setError(t("manager.settings.error", props.locale, { message: errorText(err) }));
      }
      props.onBack(false);
      props.onUnauthorized();
    }
  };
  return { busy, error, warning, submit };
}

export function SwitchForm(props: SwitchFormProps) {
  const { locale, initial } = props;
  const [draft, setDraft] = useState<SwitchInput>(() => initialDraft(initial));
  const update = (change: Partial<SwitchInput>) => setDraft((prev) => ({ ...prev, ...change }));
  const { devices, hostMissing, choose } = useTargetChoice(props, update);
  const { busy, error, warning, submit } = useSubmit(props);
  const saved = warning !== null;
  const back = () => !busy && props.onBack(saved);
  return (
    <div data-testid="switch-form">
      <h6 class="mb-3" data-testid="switch-form-title">
        {t(initial ? "switches.modal.edit" : "switches.modal.create", locale)}
      </h6>
      <SwitchFields
        locale={locale}
        draft={draft}
        editing={initial !== null}
        devices={devices}
        hostMissing={hostMissing}
        disabled={busy || saved}
        onChange={update}
        onChooseTarget={choose}
      />
      <FormFooter
        locale={locale}
        busy={busy}
        saved={saved}
        message={warning ?? error}
        onSave={() => void submit(draft)}
        onBack={back}
      />
    </div>
  );
}

interface FieldsProps {
  locale: string;
  draft: SwitchInput;
  editing: boolean;
  devices: Devices;
  /** Gewähltes Gerät ohne bekannte Adresse: Hinweis unter dem Adressfeld */
  hostMissing: boolean;
  disabled: boolean;
  onChange: (change: Partial<SwitchInput>) => void;
  onChooseTarget: (target: SwitchTarget) => void;
}

function SwitchFields(props: FieldsProps) {
  const { locale, draft, editing, disabled, onChange } = props;
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
      <FormRow locale={locale} field="target">
        <TargetSelect
          locale={locale}
          target={draft.target}
          devices={props.devices}
          disabled={disabled}
          onChange={props.onChooseTarget}
        />
      </FormRow>
      <FormRow locale={locale} field="name">
        {text("name", { maxLength: 60 })}
      </FormRow>
      <FormRow locale={locale} field="host">
        <>
          {text("host", { placeholder: "192.168.1.50", inputMode: "url" })}
          {props.hostMissing && (
            <div class="form-text" data-testid="switch-host-unknown">
              {t("switches.host.unknown", locale)}
            </div>
          )}
        </>
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

interface FooterProps {
  locale: string;
  busy: boolean;
  /** Gespeichert mit Verbindungsfehler: nur noch „Zurück“ */
  saved: boolean;
  message: string | null;
  onSave: () => void;
  onBack: () => void;
}

function FormFooter({ locale, busy, saved, message, onSave, onBack }: FooterProps) {
  return (
    <>
      {message && (
        <div
          class="text-danger small mb-3"
          data-testid={saved ? "switch-form-warning" : "switch-form-error"}
        >
          ⚠ {message}
        </div>
      )}
      <div class="d-flex justify-content-end gap-2">
        <button
          type="button"
          class="btn btn-link text-muted"
          data-testid="switch-form-back"
          disabled={busy}
          onClick={onBack}
        >
          {t("switches.form.back", locale)}
        </button>
        {!saved && (
          <button
            type="button"
            class="btn btn-primary"
            data-testid="switch-form-save"
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
