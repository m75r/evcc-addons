// ⏻ im Kartenkopf einer Verbraucher-Karte von consumers: schaltet die gebundene Tapo-Steckdose direkt
// über das Gateway (ohne Login, wie die Modus-Buttons von evcc). Zustand aus dem SwitchListStore.
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { SwitchClient, SwitchInfo } from "../dialog/client.js";
import { t } from "../i18n.js";
import { POWER_ICON } from "../icons.js";
import type { SwitchListState, SwitchListStore } from "../switch-list.js";
import { errorText } from "../ui/errors.js";
import { useSwitchList } from "../ui/useSwitchList.js";
import type { CardActionContext, CardActionHandle, CardActionSlots } from "./contract.js";
import { renderMessage } from "./LoadpointButtons.js";

export interface ConsumerDeps {
  client: Pick<SwitchClient, "setPower">;
  store: SwitchListStore;
}

/** Steckdose mit Verbraucher-Bindung an genau diesen Titel */
export function consumerSwitch(state: SwitchListState, title: string): SwitchInfo | null {
  if (state.kind !== "ready") return null;
  const match = (entry: SwitchInfo) =>
    entry.target.kind === "consumer" && entry.target.title === title;
  return state.value.find(match) ?? null;
}

interface ButtonProps extends ConsumerDeps {
  title: string;
  locale: string;
  message: HTMLElement;
}

/** Schalten mit Sperre während der Anfrage; danach lädt der Store neu */
function usePower(deps: ConsumerDeps, locale: string) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = async (info: SwitchInfo) => {
    setBusy(true);
    setError(null);
    try {
      await deps.client.setPower(info.id, info.status.on !== true);
      await deps.store.refresh();
    } catch (err) {
      setError(t("actions.powerError", locale, { message: errorText(err) }));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, toggle };
}

function ConsumerButton({ client, store, title, locale, message }: ButtonProps) {
  const info = consumerSwitch(useSwitchList(store), title);
  const { busy, error, toggle } = usePower({ client, store }, locale);
  const unreachable = info?.status.reachable === false;
  const text = unreachable
    ? t("actions.unreachable", locale, { message: info?.status.error ?? "" })
    : error;
  useEffect(() => renderMessage(message, text), [message, text]);
  const on = info?.status.on === true;
  const label = t("actions.consumerPower", locale);
  return (
    <div class="evcc-switches-tapo-modes" role="group">
      <button
        type="button"
        class={`evcc-switches-tapo-mode-btn${on ? " active" : ""}`}
        data-testid="consumer-switch-power"
        aria-pressed={on}
        aria-label={label}
        title={label}
        disabled={busy || unreachable || !info}
        onClick={() => info && void toggle(info)}
        dangerouslySetInnerHTML={{ __html: POWER_ICON }}
      />
    </div>
  );
}

export function mountConsumerButton(
  deps: ConsumerDeps,
  slots: CardActionSlots,
  initial: CardActionContext,
): CardActionHandle {
  let ctx = initial;
  const draw = () =>
    render(
      <ConsumerButton
        {...deps}
        title={ctx.card.title}
        locale={ctx.locale}
        message={slots.message}
      />,
      slots.actions,
    );
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
