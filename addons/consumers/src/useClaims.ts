// Anbieter von consumers.cardActions: einsammeln, abonnieren und je Karte nach claims fragen
import type { AddonApi, ExtensionEntry } from "@evcc-addons/sdk";
import { useEffect, useState } from "preact/hooks";
import { CARD_ACTIONS, type CardActionsProvider, type CardRef } from "./extension-contract.js";

export type ProviderEntry = ExtensionEntry<CardActionsProvider>;

/** Fehler eines Anbieters, angezeigt auf der Karte */
export interface ExtensionFailure {
  addonId: string;
  message: string;
}

/** Beanspruchende Anbieter einer Karte; ein Fehler in `claims` zählt als nicht beansprucht */
export interface Claim {
  providers: ProviderEntry[];
  errors: ExtensionFailure[];
}

export function failureOf(addonId: string, err: unknown): ExtensionFailure {
  return { addonId, message: err instanceof Error ? err.message : String(err) };
}

/** Abo eines Anbieters; ein Fehler darin erscheint in der Konsole, die Seite läuft weiter */
function subscribeTo(entry: ProviderEntry, onChange: () => void): () => void {
  try {
    return entry.value.subscribe(onChange);
  } catch (err) {
    setTimeout(() => {
      throw err;
    });
    return () => undefined;
  }
}

/** Neu rendern bei neuen oder abgemeldeten Anbietern und bei deren `subscribe`-Meldungen */
function useProviderUpdates(api: AddonApi): void {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((n) => n + 1);
    let offs: (() => void)[] = [];
    const resubscribe = () => {
      offs.forEach((off) => off());
      offs = api.extensions.get<CardActionsProvider>(CARD_ACTIONS).map((e) => subscribeTo(e, bump));
    };
    resubscribe();
    const offPoint = api.extensions.onChange(CARD_ACTIONS, () => {
      resubscribe();
      bump();
    });
    return () => {
      offPoint();
      offs.forEach((off) => off());
    };
  }, [api]);
}

export function useClaims(api: AddonApi): (card: CardRef) => Claim {
  useProviderUpdates(api);
  const entries = api.extensions.get<CardActionsProvider>(CARD_ACTIONS);
  return (card) => claimOf(entries, card);
}

export function claimOf(entries: ProviderEntry[], card: CardRef): Claim {
  const claim: Claim = { providers: [], errors: [] };
  for (const entry of entries) {
    try {
      if (entry.value.claims(card)) claim.providers.push(entry);
    } catch (err) {
      claim.errors.push(failureOf(entry.addonId, err));
    }
  }
  return claim;
}
