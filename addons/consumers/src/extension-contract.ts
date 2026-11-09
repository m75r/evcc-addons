// Vertrag des Erweiterungspunkts `consumers.cardActions`: Steckdosen-Addons liefern Buttons für Karten.
// Anbieter (z. B. switches-tapo) kopieren diese Typen mit Verweis auf diese Datei.
import type { Mode } from "./model.js";

export const CARD_ACTIONS = "consumers.cardActions";

/**
 * Karte der Seite „Verbraucher“. `title` ist der angezeigte Titel:
 * `title || #<n>` bei Ladepunkten, `title || name` bei Metern.
 */
export type CardRef =
  | { kind: "loadpoint"; index: number; title: string }
  | { kind: "meter"; usage: "consumer" | "aux"; name: string; title: string };

/** Leere Elemente der Karte: `actions` rechts im Kartenkopf, `message` unter den Zeilen */
export interface CardActionSlots {
  actions: HTMLElement;
  message: HTMLElement;
}

/** `mode` ist bei Meter-Karten null */
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
  /** true, wenn der Anbieter diese Karte bedient (nur eigene Geräte beanspruchen) */
  claims(card: CardRef): boolean;
  /** Meldet geänderte Beanspruchungen; consumers fragt dann `claims` neu ab */
  subscribe(onChange: () => void): () => void;
  /** Rendert mit eigener Preact-Instanz in die Slots */
  mount(slots: CardActionSlots, ctx: CardActionContext): CardActionHandle;
}
