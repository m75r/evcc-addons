// Karte eines reinen Messverbrauchers (consumer- oder aux-Meter)
import { Card, Row } from "./Card.js";
import { formatEnergyKWh, formatPower } from "./format.js";
import { texts, type Texts } from "./i18n.js";
import { deviceIcon } from "./icons.js";
import type { MeterStatus } from "./meter-status.js";
import { meterRows, type MeterCardData, type MeterRow, type MeterRowKind } from "./model.js";

export interface MeterCardProps {
  card: MeterCardData;
  /** Gerätestatus, nur mit Admin-Login vorhanden */
  status?: MeterStatus;
  locale: string;
}

const TEST_IDS: Record<MeterRowKind, string> = {
  power: "consumer-power",
  energy: "consumer-consumed",
  chargedEnergy: "consumer-charged",
};

function label(kind: MeterRowKind, t: Texts): string {
  if (kind === "power") return t.power;
  return kind === "energy" ? t.consumed : t.charged;
}

function format(row: MeterRow, locale: string): string {
  return row.kind === "power" ? formatPower(row.value, locale) : formatEnergyKWh(row.value, locale);
}

export function MeterCard({ card, status, locale }: MeterCardProps) {
  const t = texts(locale);
  return (
    <Card icon={deviceIcon(card.icon)} title={card.title} testId={`consumer-meter-${card.name}`}>
      {meterRows(card, status).map((row) => (
        <Row
          key={row.kind}
          label={label(row.kind, t)}
          value={format(row, locale)}
          muted={row.value === undefined}
          error={row.error}
          testId={TEST_IDS[row.kind]}
        />
      ))}
    </Card>
  );
}
