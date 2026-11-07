// Karte eines schaltbaren Verbrauchers (Ladepunkt mit Steckdose)
import type { AddonApi } from "@evcc-addons/sdk";
import { useState } from "preact/hooks";
import { Card, Row } from "./Card.js";
import { displayEnergyWh, displayPower } from "./format.js";
import { texts } from "./i18n.js";
import { deviceIcon } from "./icons.js";
import { ModeButtons } from "./ModeButtons.js";
import type { SwitchCardData } from "./model.js";

export interface SwitchCardProps {
  card: SwitchCardData;
  api: AddonApi;
  locale: string;
  /** Einstellung „Verbraucht anzeigen“ */
  showEnergy: boolean;
}

export function SwitchCard({ card, api, locale, showEnergy }: SwitchCardProps) {
  const [error, setError] = useState<string | null>(null);
  const t = texts(locale);
  const power = displayPower(card.power, locale);
  const charged = displayEnergyWh(card.chargedEnergyWh, locale);
  const modes = (
    <ModeButtons api={api} index={card.index} mode={card.mode} locale={locale} onError={setError} />
  );
  return (
    <Card
      icon={deviceIcon(card.icon)}
      title={card.title}
      testId={`consumer-switch-${card.index}`}
      actions={modes}
    >
      <Row label={t.power} value={power.text} muted={power.muted} testId="consumer-power" />
      {showEnergy && (
        <Row
          label={t.charged}
          value={charged.text}
          muted={charged.muted}
          testId="consumer-charged"
        />
      )}
      <Row label={t.status} value={card.enabled ? t.on : t.off} testId="consumer-status" />
      {error && (
        <div class="evcc-consumers-error" data-testid="consumer-error">
          {error}
        </div>
      )}
    </Card>
  );
}
