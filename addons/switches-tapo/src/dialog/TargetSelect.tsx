// Auswahl „Gerät aus evcc“: Ladepunkte und Verbraucher in zwei Gruppen, ohne evcc von Hand
import { t } from "../i18n.js";
import type { EvccDevices, SwitchTarget, TargetKind } from "./client.js";

export type Devices =
  { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; value: EvccDevices };

const SEPARATOR = ":";

/** Wert im Select, z. B. `consumer:Kaffeemaschine`; ohne Titel leer */
export function targetValue(target: SwitchTarget): string {
  return target.title === "" ? "" : `${target.kind}${SEPARATOR}${target.title}`;
}

export function parseTargetValue(value: string): SwitchTarget {
  const index = value.indexOf(SEPARATOR);
  const kind = value.slice(0, index) === "consumer" ? "consumer" : "loadpoint";
  return { kind, title: index < 0 ? "" : value.slice(index + 1) };
}

export interface TargetSelectProps {
  locale: string;
  target: SwitchTarget;
  devices: Devices;
  disabled: boolean;
  onChange: (target: SwitchTarget) => void;
}

export function TargetSelect(props: TargetSelectProps) {
  const { locale, target, devices } = props;
  return (
    <>
      {devices.kind === "error" ? (
        <ManualTarget {...props} message={devices.message} />
      ) : (
        <DeviceSelect {...props} />
      )}
      {target.title !== "" && (
        <div class="form-text" data-testid="switch-target-hint">
          {t(
            target.kind === "loadpoint"
              ? "switches.target.hint.loadpoint"
              : "switches.target.hint.consumer",
            locale,
          )}
        </div>
      )}
    </>
  );
}

/** Ein gebundener, nicht mehr vorhandener Titel bleibt in seiner Gruppe wählbar */
function DeviceSelect({ locale, target, devices, disabled, onChange }: TargetSelectProps) {
  const ready = devices.kind === "ready" ? devices.value : null;
  const value = targetValue(target);
  return (
    <select
      id="switch-field-target"
      class="form-select form-select-sm"
      data-testid="switch-target"
      value={value}
      disabled={disabled || !ready}
      onChange={(e) => onChange(parseTargetValue(e.currentTarget.value))}
    >
      {!ready && <option value={value}>{t("switches.target.loading", locale)}</option>}
      {ready && value === "" && <option value="">{t("switches.target.choose", locale)}</option>}
      {ready && (
        <>
          <Group locale={locale} kind="loadpoint" titles={ready.loadpoints} target={target} />
          <Group locale={locale} kind="consumer" titles={ready.consumers} target={target} />
        </>
      )}
    </select>
  );
}

interface GroupProps {
  locale: string;
  kind: TargetKind;
  titles: string[];
  target: SwitchTarget;
}

function Group({ locale, kind, titles, target }: GroupProps) {
  const list = [...new Set(titles)];
  const missing = target.kind === kind && target.title !== "" && !list.includes(target.title);
  const label = t(
    kind === "loadpoint" ? "switches.group.loadpoints" : "switches.group.consumers",
    locale,
  );
  return (
    <optgroup label={label}>
      {missing && (
        <option value={targetValue(target)}>
          {t("switches.target.notFound", locale, { title: target.title })}
        </option>
      )}
      {list.map((title) => (
        <option key={title} value={targetValue({ kind, title })}>
          {title}
        </option>
      ))}
    </optgroup>
  );
}

/** Ohne evcc: Art wählen, Titel eintragen */
function ManualTarget({
  locale,
  target,
  disabled,
  onChange,
  message,
}: TargetSelectProps & { message: string }) {
  return (
    <>
      <select
        id="switch-field-target"
        class="form-select form-select-sm mb-1"
        data-testid="switch-target-kind"
        value={target.kind}
        disabled={disabled}
        onChange={(e) => onChange({ ...target, kind: e.currentTarget.value as TargetKind })}
      >
        <option value="loadpoint">{t("switches.kind.loadpoint", locale)}</option>
        <option value="consumer">{t("switches.kind.consumer", locale)}</option>
      </select>
      <input
        class="form-control form-control-sm"
        data-testid="switch-target-title"
        value={target.title}
        disabled={disabled}
        onInput={(e) => onChange({ ...target, title: e.currentTarget.value })}
      />
      <div class="form-text" data-testid="switch-targets-error">
        {t("switches.target.unavailable", locale, { message })}
      </div>
    </>
  );
}
