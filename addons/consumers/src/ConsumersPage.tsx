// Seite „Verbraucher“: Ladepunkte mit Steckdose und Verbraucher-Meter live, gegliedert nach Schaltbarkeit.
// Schaltbar ist eine Karte, wenn ein Anbieter von consumers.cardActions sie beansprucht.
import type { AddonApi } from "@evcc-addons/sdk";
import { useEffect, useState } from "preact/hooks";
import type { CardActionContext } from "./extension-contract.js";
import { texts, type Texts } from "./i18n.js";
import { LoadpointCard } from "./LoadpointCard.js";
import { MeterCard } from "./MeterCard.js";
import type { MeterStatus } from "./meter-status.js";
import {
  cardRef,
  meterPower,
  splitByClaim,
  toLoadpointCards,
  toMeterCards,
  type CardItem,
} from "./model.js";
import { useSettings } from "./settings.js";
import { useClaims, type Claim } from "./useClaims.js";
import { useMeterStatus, type MeterStatusState } from "./useMeterStatus.js";

const KEYS = ["loadpoints", "consumers", "aux"] as const;

/** Zählt bei jeder Änderung hoch; die Werte selbst sind Live-Objekte und behalten ihre Referenz */
function useLiveVersion(api: AddonApi): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((n) => n + 1);
    const offs = [...KEYS.map((key) => api.state.subscribe(key, bump)), api.onEnvChange(bump)];
    return () => offs.forEach((off) => off());
  }, [api]);
  return version;
}

/** `claims` je Karte nur einmal pro Rendern abfragen */
function useItemClaims(api: AddonApi): (item: CardItem) => Claim {
  const claimFor = useClaims(api);
  const cache = new Map<CardItem, Claim>();
  return (item) => {
    const cached = cache.get(item) ?? claimFor(cardRef(item));
    cache.set(item, cached);
    return cached;
  };
}

export function ConsumersPage({ api }: { api: AddonApi }) {
  useLiveVersion(api);
  const settings = useSettings(api);
  const locale = api.locale();
  const t = texts(locale);
  const loadpoints = toLoadpointCards(api.state.get("loadpoints"), locale);
  const meters = toMeterCards(api.state.get("consumers"), api.state.get("aux"), locale);
  // Namen in Basisordnung, damit die Abfrage beim Umsortieren nicht neu startet
  const devices = useMeterStatus(api, meters.map((card) => card.name).filter(Boolean));
  const claim = useItemClaims(api);
  const powerOf = (item: CardItem) =>
    item.kind === "loadpoint"
      ? item.card.power
      : meterPower(item.card, devices.statuses[item.card.name]);
  const split = splitByClaim(loadpoints, meters, {
    isClaimed: (item) => claim(item).providers.length > 0,
    sort: settings.sort,
    locale,
    powerOf,
  });
  const common = { claim, locale, showEnergy: settings.showEnergy, statuses: devices.statuses };
  return (
    <div class="evcc-consumers" data-testid="consumers-page">
      {meters.length > 0 && <MeterHints devices={devices} t={t} showEnergy={settings.showEnergy} />}
      <Section
        {...common}
        title={t.switchable}
        testId="consumers-switchable"
        items={split.switchable}
      />
      <Section {...common} title={t.measured} testId="consumers-measured" items={split.measured} />
      {split.switchable.length + split.measured.length === 0 && (
        <p class="text-muted" data-testid="consumers-empty">
          {t.empty}
        </p>
      )}
    </div>
  );
}

interface ItemProps {
  claim: (item: CardItem) => Claim;
  locale: string;
  showEnergy: boolean;
  statuses: Record<string, MeterStatus | undefined>;
}

interface SectionProps extends ItemProps {
  title: string;
  testId: string;
  items: CardItem[];
}

/** Leere Abschnitte entfallen */
function Section({ title, testId, items, ...props }: SectionProps) {
  if (items.length === 0) return null;
  return (
    <>
      <h2 class="evcc-consumers-section">{title}</h2>
      <div class="evcc-consumers-grid" data-testid={testId}>
        {items.map((item) => (
          <ItemCard key={`${item.kind}-${cardKey(item)}`} {...props} item={item} />
        ))}
      </div>
    </>
  );
}

function cardKey(item: CardItem): string {
  return item.kind === "loadpoint" ? String(item.card.index) : item.card.name;
}

function ItemCard({ item, claim, locale, showEnergy, statuses }: ItemProps & { item: CardItem }) {
  const mode = item.kind === "loadpoint" ? item.card.mode : null;
  const context: CardActionContext = { card: cardRef(item), mode, locale };
  const common = { claim: claim(item), context, locale, showEnergy };
  if (item.kind === "loadpoint") return <LoadpointCard {...common} card={item.card} />;
  return <MeterCard {...common} card={item.card} status={statuses[item.card.name]} />;
}

interface MeterHintsProps {
  devices: MeterStatusState;
  t: Texts;
  showEnergy: boolean;
}

/** Login-Hinweis (nennt „Geladen“ nur, wenn die Zeile eingeblendet ist) und Abfragefehler */
function MeterHints({ devices, t, showEnergy }: MeterHintsProps) {
  return (
    <>
      {devices.auth === "unauthorized" && (
        <p class="evcc-consumers-hint" data-testid="consumers-login-hint">
          {showEnergy ? t.loginHint : t.loginHintGeneric}
        </p>
      )}
      {devices.error && (
        <p class="evcc-consumers-error" data-testid="consumers-status-error">
          {t.statusError}: {devices.error}
        </p>
      )}
    </>
  );
}
