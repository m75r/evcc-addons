// Gemeinsamer Kartenaufbau: Kopfzeile (Icon + Titel), Trennlinie, Zeilen „Label – Wert“
import type { ComponentChildren } from "preact";

export interface CardProps {
  icon: string;
  title: string;
  testId: string;
  children: ComponentChildren;
}

export function Card({ icon, title, testId, children }: CardProps) {
  return (
    <div class="round-box evcc-consumers-card" data-testid={testId}>
      <div class="evcc-consumers-head">
        <span
          class="evcc-consumers-icon"
          data-testid="consumer-icon"
          dangerouslySetInnerHTML={{ __html: icon }}
        />
        <strong class="text-truncate">{title}</strong>
      </div>
      <hr />
      {children}
    </div>
  );
}

export interface RowProps {
  label: string;
  value: string;
  /** Kein Wert vorhanden: grau wie evcc (`value--muted`) */
  muted?: boolean;
  /** Lesefehler des Geräts: rot wie evcc (`value--error`), Meldung als Tooltip */
  error?: string;
  testId?: string;
}

/** Zeile wie evcc DeviceTags: Label in Textfarbe, Wert fett in Primärfarbe */
export function Row({ label, value, muted = false, error, testId }: RowProps) {
  const state = error ? " is-error" : muted ? " is-muted" : "";
  return (
    <div class="evcc-consumers-row">
      <span class="evcc-consumers-label">{label}</span>
      <span class={`evcc-consumers-value${state}`} data-testid={testId} title={error}>
        {value}
      </span>
    </div>
  );
}
