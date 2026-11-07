// Icon-Buttons ⏻ und ☀ im Kartenkopf wie evcc IconSelectGroup; den neuen Zustand liefert der WebSocket
import type { AddonApi } from "@evcc-addons/sdk";
import { useState } from "preact/hooks";
import { texts } from "./i18n.js";
import { POWER_ICON, SUN_ICON } from "./icons.js";
import { nextMode, type Mode, type ModeButton } from "./model.js";

export interface ModeButtonsProps {
  api: AddonApi;
  /** 0-basierter Ladepunkt-Index */
  index: number;
  mode: Mode | null;
  locale: string;
  onError: (message: string | null) => void;
}

export async function setMode(api: AddonApi, index: number, mode: Mode): Promise<void> {
  const res = await api.evccApi(`loadpoints/${index + 1}/mode/${mode}`, { method: "POST" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export function ModeButtons({ api, index, mode, locale, onError }: ModeButtonsProps) {
  const [busy, setBusy] = useState(false);
  const t = texts(locale);
  const press = async (button: ModeButton) => {
    setBusy(true);
    onError(null);
    try {
      await setMode(api, index, nextMode(mode, button));
    } catch (err) {
      onError(`${t.modeError}: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  const common = { busy, onPress: (button: ModeButton) => void press(button) };
  return (
    <div class="evcc-consumers-modes" role="group" data-testid={`consumer-mode-${index}`}>
      <IconButton {...common} button="power" active={mode === "now"} label={t.modePower} />
      <IconButton {...common} button="smart" active={mode === "smart"} label={t.modeSmartToggle} />
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
function IconButton({ button, active, label, busy, onPress }: IconButtonProps) {
  return (
    <button
      type="button"
      class={`evcc-consumers-mode-btn${active ? " active" : ""}`}
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
