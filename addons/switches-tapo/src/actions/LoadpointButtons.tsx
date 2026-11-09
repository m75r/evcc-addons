// ⏻ und ☀ im Kartenkopf einer Ladepunkt-Karte von consumers (aus addons/consumers/src/ModeButtons.tsx).
// Eigene Preact-Instanz: Buttons in slots.actions, Fehler in slots.message; den neuen Modus liefert evcc.
import type { AddonApi } from "@evcc-addons/sdk";
import { render } from "preact";
import { useState } from "preact/hooks";
import { t } from "../i18n.js";
import { POWER_ICON, SUN_ICON } from "../icons.js";
import type { CardActionContext, CardActionHandle, CardActionSlots, Mode } from "./contract.js";
import { nextMode, type ModeButton } from "./model.js";

type EvccApi = Pick<AddonApi, "evccApi">;

export async function setMode(api: EvccApi, index: number, mode: Mode): Promise<void> {
  const res = await api.evccApi(`loadpoints/${index + 1}/mode/${mode}`, { method: "POST" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

interface ModeButtonsProps {
  api: EvccApi;
  /** 0-basierter Ladepunkt-Index */
  index: number;
  mode: Mode | null;
  locale: string;
  onError: (message: string | null) => void;
}

function ModeButtons({ api, index, mode, locale, onError }: ModeButtonsProps) {
  const [busy, setBusy] = useState(false);
  const press = async (button: ModeButton) => {
    setBusy(true);
    onError(null);
    try {
      await setMode(api, index, nextMode(mode, button));
    } catch (err) {
      onError(`${t("actions.modeError", locale)}: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  const common = { busy, onPress: (button: ModeButton) => void press(button) };
  return (
    <div class="evcc-switches-tapo-modes" role="group" data-testid={`consumer-mode-${index}`}>
      <IconButton
        {...common}
        button="power"
        active={mode === "now"}
        label={t("actions.power", locale)}
      />
      <IconButton
        {...common}
        button="smart"
        active={mode === "smart"}
        label={t("actions.smart", locale)}
      />
    </div>
  );
}

const ICONS: Record<ModeButton, string> = { power: POWER_ICON, smart: SUN_ICON };

interface IconButtonProps {
  button: ModeButton;
  active: boolean;
  label: string;
  busy: boolean;
  onPress: (button: ModeButton) => void;
}

/** Ein Button wie evcc IconSelectItem: invertiert, wenn aktiv */
export function IconButton({ button, active, label, busy, onPress }: IconButtonProps) {
  return (
    <button
      type="button"
      class={`evcc-switches-tapo-mode-btn${active ? " active" : ""}`}
      data-testid={`consumer-mode-${button}`}
      aria-pressed={active}
      aria-label={label}
      title={label}
      disabled={busy}
      onClick={() => onPress(button)}
      dangerouslySetInnerHTML={{ __html: ICONS[button] }}
    />
  );
}

/** Fehlermeldung im Slot `message` (gleiche testid wie früher in consumers) */
export function renderMessage(slot: HTMLElement, message: string | null): void {
  render(
    message ? (
      <div class="evcc-switches-tapo-error" data-testid="consumer-error">
        {message}
      </div>
    ) : null,
    slot,
  );
}

export function mountLoadpointButtons(
  api: EvccApi,
  slots: CardActionSlots,
  initial: CardActionContext,
): CardActionHandle {
  let ctx = initial;
  const onError = (message: string | null) => renderMessage(slots.message, message);
  const draw = () => {
    const index = ctx.card.kind === "loadpoint" ? ctx.card.index : -1;
    render(
      <ModeButtons api={api} index={index} mode={ctx.mode} locale={ctx.locale} onError={onError} />,
      slots.actions,
    );
  };
  draw();
  return {
    update: (next) => {
      ctx = next;
      draw();
    },
    destroy: () => {
      render(null, slots.actions);
      render(null, slots.message);
    },
  };
}
