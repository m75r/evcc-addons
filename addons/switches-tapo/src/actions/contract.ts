// Kopie des Vertrags von consumers.cardActions (Quelle: addons/consumers/src/extension-contract.ts,
// später m75r/evcc-addon-consumers). Bei Änderungen dort hier nachziehen.

export const CARD_ACTIONS = "consumers.cardActions";

/** Modus eines evcc-Ladepunkts, wie ihn consumers liefert */
export type Mode = "off" | "smart" | "now";

export type CardRef =
  | { kind: "loadpoint"; index: number; title: string }
  | { kind: "meter"; usage: "consumer" | "aux"; name: string; title: string };

export interface CardActionSlots {
  actions: HTMLElement;
  message: HTMLElement;
}

export interface CardActionContext {
  card: CardRef;
  mode: Mode | null;
  locale: string;
}

export interface CardActionHandle {
  update(ctx: CardActionContext): void;
  destroy(): void;
}

export interface CardActionsProvider {
  claims(card: CardRef): boolean;
  subscribe(onChange: () => void): () => void;
  mount(slots: CardActionSlots, ctx: CardActionContext): CardActionHandle;
}
