// Leistungs- und Energieformat wie evcc (formatter.ts, Einheit automatisch)

const MISSING = "–";

function formatNumber(value: number, digits: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "decimal",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** 0 → „0,0 kW“, unter 1000 W → W ohne Nachkommastelle, sonst kW mit einer Nachkommastelle */
export function formatPower(watt: number | undefined, locale: string, suffix = ""): string {
  if (watt === undefined || !Number.isFinite(watt)) return MISSING;
  if (watt !== 0 && Math.abs(watt) < 1000) return `${formatNumber(watt, 0, locale)} W${suffix}`;
  return `${formatNumber(watt / 1000, 1, locale)} kW${suffix}`;
}

export function formatEnergyWh(wh: number | undefined, locale: string): string {
  return formatPower(wh, locale, "h");
}

export function formatEnergyKWh(kwh: number | undefined, locale: string): string {
  return formatEnergyWh(kwh === undefined ? undefined : kwh * 1000, locale);
}
