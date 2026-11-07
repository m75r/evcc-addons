// Seite „Verbraucher“: schaltbare Steckdosen-Ladepunkte und reine Messverbraucher, live
import type { AddonApi } from "@evcc-addons/sdk";
import { useEffect, useState } from "preact/hooks";
import { texts, type Texts } from "./i18n.js";
import { MeterCard } from "./MeterCard.js";
import {
  meterPower,
  sortCards,
  toMeterCards,
  toSwitchCards,
  type MeterCardData,
  type SwitchCardData,
} from "./model.js";
import { useSettings, type ConsumerSettings } from "./settings.js";
import { SwitchCard } from "./SwitchCard.js";
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

export function ConsumersPage({ api }: { api: AddonApi }) {
  useLiveVersion(api);
  const settings = useSettings(api);
  const locale = api.locale();
  const t = texts(locale);
  const switches = toSwitchCards(api.state.get("loadpoints"), locale);
  const meters = toMeterCards(api.state.get("consumers"), api.state.get("aux"), locale);
  return (
    <div class="evcc-consumers" data-testid="consumers-page">
      <SwitchSection api={api} cards={switches} locale={locale} t={t} settings={settings} />
      <MeterSection api={api} cards={meters} locale={locale} t={t} settings={settings} />
    </div>
  );
}

interface SectionProps<T> {
  api: AddonApi;
  /** nach Name sortiert (Basisordnung) */
  cards: T[];
  locale: string;
  t: Texts;
  settings: ConsumerSettings;
}

function SwitchSection({ api, cards, locale, t, settings }: SectionProps<SwitchCardData>) {
  const sorted = sortCards(cards, settings.sort, locale, (card) => card.power);
  return (
    <>
      <h2 class="evcc-consumers-section">{t.switchable}</h2>
      {sorted.length === 0 ? (
        <p class="text-muted" data-testid="consumers-empty-switchable">
          {t.emptySwitchable}
        </p>
      ) : (
        <div class="evcc-consumers-grid" data-testid="consumers-switchable">
          {sorted.map((card) => (
            <SwitchCard
              key={card.index}
              card={card}
              api={api}
              locale={locale}
              showEnergy={settings.showEnergy}
            />
          ))}
        </div>
      )}
    </>
  );
}

function MeterSection({ api, cards, locale, t, settings }: SectionProps<MeterCardData>) {
  // Namen in Basisordnung, damit die Abfrage beim Umsortieren nicht neu startet
  const devices = useMeterStatus(api, cards.map((card) => card.name).filter(Boolean));
  const powerOf = (card: MeterCardData) => meterPower(card, devices.statuses[card.name]);
  const sorted = sortCards(cards, settings.sort, locale, powerOf);
  return (
    <>
      <h2 class="evcc-consumers-section">{t.measured}</h2>
      {sorted.length === 0 ? (
        <p class="text-muted" data-testid="consumers-empty-measured">
          {t.emptyMeasured}
        </p>
      ) : (
        <>
          <MeterHints devices={devices} t={t} showEnergy={settings.showEnergy} />
          <div class="evcc-consumers-grid" data-testid="consumers-measured">
            {sorted.map((card) => (
              <MeterCard
                key={card.name}
                card={card}
                status={devices.statuses[card.name]}
                locale={locale}
                showEnergy={settings.showEnergy}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
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
