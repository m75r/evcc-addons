// Eine Zeile im Einstellungs-Modal wie evcc FormRow: Label links, Steuerelement rechts
import type {
  BooleanSettingDef,
  SelectSettingDef,
  SettingDef,
  SettingValue,
} from "@evcc-addons/sdk";
import { localize } from "../i18n.js";

export interface SettingFieldProps {
  addonId: string;
  def: SettingDef;
  value: SettingValue | undefined;
  disabled: boolean;
  locale: string;
  onChange: (value: SettingValue) => void;
}

interface ControlProps<T extends SettingDef> extends Omit<SettingFieldProps, "def" | "addonId"> {
  def: T;
  inputId: string;
}

export function SettingField({ addonId, ...props }: SettingFieldProps) {
  const inputId = `addon-setting-${addonId}-${props.def.key}`;
  return (
    <div class="mb-4 row">
      <label class="col-sm-6 col-form-label" for={inputId}>
        {localize(props.def.label, props.locale)}
      </label>
      <div class="col-sm-6">
        {props.def.type === "boolean" ? (
          <SwitchControl {...props} def={props.def} inputId={inputId} />
        ) : (
          <SelectControl {...props} def={props.def} inputId={inputId} />
        )}
      </div>
    </div>
  );
}

/** Ja/Nein wie in evcc: form-check form-switch */
function SwitchControl({
  def,
  value,
  disabled,
  inputId,
  onChange,
}: ControlProps<BooleanSettingDef>) {
  return (
    <div class="form-check form-switch pt-2">
      <input
        id={inputId}
        class="form-check-input"
        type="checkbox"
        role="switch"
        data-testid={`addon-setting-${def.key}`}
        checked={value === true}
        disabled={disabled}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
    </div>
  );
}

function SelectControl(props: ControlProps<SelectSettingDef>) {
  const { def, value, inputId, locale } = props;
  return (
    <select
      id={inputId}
      class="form-select form-select-sm mt-1"
      data-testid={`addon-setting-${def.key}`}
      value={typeof value === "string" ? value : def.default}
      disabled={props.disabled}
      onChange={(e) => props.onChange(e.currentTarget.value)}
    >
      {def.options.map((option) => (
        <option key={option.value} value={option.value}>
          {localize(option.label, locale)}
        </option>
      ))}
    </select>
  );
}
