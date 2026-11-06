// Umschalter Aus | Smart | Schnell; den neuen Zustand liefert danach der WebSocket
import type { AddonApi } from "@evcc-addons/sdk";
import { useState } from "preact/hooks";
import { texts } from "./i18n.js";
import type { Mode } from "./model.js";

export interface ModeSwitchProps {
  api: AddonApi;
  /** 0-basierter Ladepunkt-Index */
  index: number;
  mode: Mode | null;
  locale: string;
  onError: (message: string | null) => void;
}

const MODES: Mode[] = ["off", "smart", "now"];

export async function setMode(api: AddonApi, index: number, mode: Mode): Promise<void> {
  const res = await api.evccApi(`loadpoints/${index + 1}/mode/${mode}`, { method: "POST" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export function ModeSwitch({ api, index, mode, locale, onError }: ModeSwitchProps) {
  const [busy, setBusy] = useState(false);
  const t = texts(locale);
  const labels: Record<Mode, string> = { off: t.modeOff, smart: t.modeSmart, now: t.modeNow };
  const select = async (next: Mode) => {
    setBusy(true);
    onError(null);
    try {
      await setMode(api, index, next);
    } catch (err) {
      onError(`${t.modeError}: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="btn-group w-100 mt-2" role="group" data-testid={`consumer-mode-${index}`}>
      {MODES.map((m) => (
        <button
          key={m}
          type="button"
          class={`btn btn-sm ${m === mode ? "btn-primary" : "btn-outline-secondary"}`}
          aria-pressed={m === mode}
          disabled={busy}
          onClick={() => void select(m)}
        >
          {labels[m]}
        </button>
      ))}
    </div>
  );
}
