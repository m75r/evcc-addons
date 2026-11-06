// Seite „Verbraucher“: schaltbare Steckdosen-Ladepunkte und reine Messverbraucher, live
import type { AddonApi } from "@evcc-addons/sdk";
import { useEffect, useState } from "preact/hooks";
import { texts, type Texts } from "./i18n.js";
import { MeterCard } from "./MeterCard.js";
import { toMeterCards, toSwitchCards, type MeterCardData, type SwitchCardData } from "./model.js";
import { SwitchCard } from "./SwitchCard.js";
import { useMeterStatus } from "./useMeterStatus.js";

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
  const locale = api.locale();
  const switches = toSwitchCards(api.state.get("loadpoints"), locale);
  const meters = toMeterCards(api.state.get("consumers"), api.state.get("aux"), locale);
  return (
    <div class="evcc-consumers" data-testid="consumers-page">
      <SwitchSection api={api} cards={switches} locale={locale} t={texts(locale)} />
      <MeterSection api={api} cards={meters} locale={locale} t={texts(locale)} />
    </div>
  );
}

interface SectionProps<T> {
  api: AddonApi;
  cards: T[];
  locale: string;
  t: Texts;
}

function SwitchSection({ api, cards, locale, t }: SectionProps<SwitchCardData>) {
  return (
    <>
      <h2 class="evcc-consumers-section">{t.switchable}</h2>
      {cards.length === 0 ? (
        <p class="text-muted" data-testid="consumers-empty-switchable">
          {t.emptySwitchable}
        </p>
      ) : (
        <div class="evcc-consumers-grid" data-testid="consumers-switchable">
          {cards.map((card) => (
            <SwitchCard key={card.index} card={card} api={api} locale={locale} />
          ))}
        </div>
      )}
    </>
  );
}

function MeterSection({ api, cards, locale, t }: SectionProps<MeterCardData>) {
  const devices = useMeterStatus(api, cards.map((card) => card.name).filter(Boolean));
  if (cards.length === 0) {
    return (
      <>
        <h2 class="evcc-consumers-section">{t.measured}</h2>
        <p class="text-muted" data-testid="consumers-empty-measured">
          {t.emptyMeasured}
        </p>
      </>
    );
  }
  return (
    <>
      <h2 class="evcc-consumers-section">{t.measured}</h2>
      {devices.auth === "unauthorized" && (
        <p class="evcc-consumers-hint" data-testid="consumers-login-hint">
          {t.loginHint}
        </p>
      )}
      {devices.error && (
        <p class="evcc-consumers-error" data-testid="consumers-status-error">
          {t.statusError}: {devices.error}
        </p>
      )}
      <div class="evcc-consumers-grid" data-testid="consumers-measured">
        {cards.map((card) => (
          <MeterCard
            key={card.name}
            card={card}
            status={devices.statuses[card.name]}
            locale={locale}
          />
        ))}
      </div>
    </>
  );
}
