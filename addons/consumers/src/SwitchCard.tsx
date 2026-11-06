// Karte eines schaltbaren Verbrauchers (Ladepunkt mit Steckdose)
import type { AddonApi } from "@evcc-addons/sdk";
import { useState } from "preact/hooks";
import { Card, Row } from "./Card.js";
import { formatEnergyWh, formatPower } from "./format.js";
import { texts } from "./i18n.js";
import { deviceIcon } from "./icons.js";
import { ModeSwitch } from "./ModeSwitch.js";
import type { SwitchCardData } from "./model.js";

export interface SwitchCardProps {
  card: SwitchCardData;
  api: AddonApi;
  locale: string;
}

export function SwitchCard({ card, api, locale }: SwitchCardProps) {
  const [error, setError] = useState<string | null>(null);
  const t = texts(locale);
  return (
    <Card icon={deviceIcon(card.icon)} title={card.title} testId={`consumer-switch-${card.index}`}>
      <Row
        label={t.power}
        value={formatPower(card.power, locale)}
        muted={card.power === undefined}
        testId="consumer-power"
      />
      <Row
        label={t.charged}
        value={formatEnergyWh(card.chargedEnergyWh, locale)}
        muted={card.chargedEnergyWh === undefined}
        testId="consumer-charged"
      />
      <Row
        label={t.status}
        value={card.enabled ? t.on : t.off}

        testId="consumer-status"
      />
      <ModeSwitch
        api={api}
        index={card.index}
        mode={card.mode}
        locale={locale}
        onError={setError}
      />
      {error && (
        <div class="evcc-consumers-error" data-testid="consumer-error">
          {error}
        </div>
      )}
    </Card>
  );
}
