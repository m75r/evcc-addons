// Karte eines reinen Messverbrauchers (consumer- oder aux-Meter)
import { Card, Row, type RowProps } from "./Card.js";
import { useCardActions } from "./CardActions.js";
import type { CardActionContext } from "./extension-contract.js";
import { displayEnergyWh, displayPower, formatEnergyKWh, type Display } from "./format.js";
import { texts, type Texts } from "./i18n.js";
import { deviceIcon } from "./icons.js";
import type { MeterStatus } from "./meter-status.js";
import { meterRows, type MeterCardData, type MeterRow, type MeterRowKind } from "./model.js";
import type { Claim } from "./useClaims.js";

export interface MeterCardProps {
  card: MeterCardData;
  /** Gerätestatus, nur mit Admin-Login vorhanden */
  status?: MeterStatus;
  locale: string;
  /** Einstellung „Verbraucht anzeigen“ */
  showEnergy: boolean;
  claim: Claim;
  context: CardActionContext;
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

/** Text je Zeile: Leistung und „Geladen“ mit „–“ für 0, „Verbraucht“ unverändert */
function displayOf(row: MeterRow, locale: string): Display {
  if (row.kind === "power") return displayPower(row.value, locale);
  if (row.kind === "chargedEnergy") {
    return displayEnergyWh(row.value === undefined ? undefined : row.value * 1000, locale);
  }
  return { text: formatEnergyKWh(row.value, locale), muted: row.value === undefined };
}

/** Darstellung einer Zeile; Leistung mit Lesefehler erscheint als Badge „offline“ */
function rowDisplay(row: MeterRow, t: Texts, locale: string): RowProps {
  const base = { label: label(row.kind, t), error: row.error, testId: TEST_IDS[row.kind] };
  if (row.kind === "power" && row.error) return { ...base, value: "", badge: t.offline };
  const { text, muted } = displayOf(row, locale);
  return { ...base, value: text, muted };
}

export function MeterCard({ card, status, locale, showEnergy, claim, context }: MeterCardProps) {
  const t = texts(locale);
  const slots = useCardActions(claim, context, t);
  return (
    <Card
      icon={deviceIcon(card.icon)}
      title={card.title}
      testId={`consumer-meter-${card.name}`}
      actions={slots.actions}
      footer={slots.message}
    >
      {meterRows(card, status, showEnergy).map((row) => (
        <Row key={row.kind} {...rowDisplay(row, t, locale)} />
      ))}
    </Card>
  );
}
