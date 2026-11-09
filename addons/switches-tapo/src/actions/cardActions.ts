// Anbieter von consumers.cardActions: beansprucht nur Karten, an die eine eigene Steckdose gebunden ist
// (Ladepunkt-Karte ↔ Ladepunkt-Bindung, Verbraucher-Meter ↔ Verbraucher-Bindung, jeweils gleicher Titel)
import type { AddonApi } from "@evcc-addons/sdk";
import type { SwitchClient, TargetKind } from "../dialog/client.js";
import type { SwitchListStore } from "../switch-list.js";
import { mountConsumerButton } from "./ConsumerButton.js";
import type { CardActionsProvider, CardRef } from "./contract.js";
import { mountLoadpointButtons } from "./LoadpointButtons.js";

export interface CardActionDeps {
  api: Pick<AddonApi, "evccApi">;
  client: Pick<SwitchClient, "setPower">;
  store: SwitchListStore;
}

/** Art der Bindung, die zu dieser Karte passt; aux-Meter bedient das Addon nicht */
function kindOf(card: CardRef): TargetKind | null {
  if (card.kind === "loadpoint") return "loadpoint";
  return card.usage === "consumer" ? "consumer" : null;
}

/** Vor dem ersten Laden der Liste wird nichts beansprucht */
function isBound(store: SwitchListStore, kind: TargetKind, title: string): boolean {
  const state = store.current();
  if (state.kind !== "ready") return false;
  return state.value.some((entry) => entry.target.kind === kind && entry.target.title === title);
}

export function cardActions({ api, client, store }: CardActionDeps): CardActionsProvider {
  return {
    claims: (card) => {
      const kind = kindOf(card);
      return kind !== null && isBound(store, kind, card.title);
    },
    subscribe: (onChange) => store.subscribe(onChange),
    mount: (slots, ctx) =>
      ctx.card.kind === "loadpoint"
        ? mountLoadpointButtons(api, slots, ctx)
        : mountConsumerButton({ client, store }, slots, ctx),
  };
}
