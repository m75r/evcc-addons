// Karte eines Ladepunkts mit Steckdose; Buttons liefern Steckdosen-Addons über consumers.cardActions
import { Card, Row } from "./Card.js";
import { useCardActions } from "./CardActions.js";
import type { CardActionContext } from "./extension-contract.js";
import { displayEnergyWh, displayPower } from "./format.js";
import { texts } from "./i18n.js";
import { deviceIcon } from "./icons.js";
import type { LoadpointCardData } from "./model.js";
import type { Claim } from "./useClaims.js";

export interface LoadpointCardProps {
  card: LoadpointCardData;
  claim: Claim;
  context: CardActionContext;
  locale: string;
  /** Einstellung „Verbraucht anzeigen“ */
  showEnergy: boolean;
}

export function LoadpointCard({ card, claim, context, locale, showEnergy }: LoadpointCardProps) {
  const t = texts(locale);
  const slots = useCardActions(claim, context, t);
  const power = displayPower(card.power, locale);
  const charged = displayEnergyWh(card.chargedEnergyWh, locale);
  return (
    <Card
      icon={deviceIcon(card.icon)}
      title={card.title}
      testId={`consumer-switch-${card.index}`}
      actions={slots.actions}
      footer={slots.message}
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
    </Card>
  );
}
