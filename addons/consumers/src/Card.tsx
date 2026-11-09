// Gemeinsamer Kartenaufbau: Kopfzeile (Icon + Titel + Aktionen), Trennlinie, Zeilen „Label – Wert“
import type { ComponentChildren } from "preact";

export interface CardProps {
  icon: string;
  title: string;
  testId: string;
  /** steht rechts im Kopf, z. B. die Buttons eines Steckdosen-Addons */
  actions?: ComponentChildren;
  /** steht unter den Zeilen, z. B. Fehlermeldungen */
  footer?: ComponentChildren;
  children: ComponentChildren;
}

export function Card({ icon, title, testId, actions, footer, children }: CardProps) {
  return (
    <div class="round-box evcc-consumers-card" data-testid={testId}>
      <div class="evcc-consumers-head">
        <span
          class="evcc-consumers-icon"
          data-testid="consumer-icon"
          dangerouslySetInnerHTML={{ __html: icon }}
        />
        <strong class="flex-grow-1 min-w-0 text-truncate" data-testid="consumer-title">
          {title}
        </strong>
        {actions && <div class="evcc-consumers-actions">{actions}</div>}
      </div>
      <hr />
      {children}
      {footer}
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
  /** Statt des Werts ein graues Badge (evcc `Badge` muted), `error` als Tooltip */
  badge?: string;
  testId?: string;
}

/** Zeile wie evcc DeviceTags: Label in Textfarbe, Wert fett in Primärfarbe */
export function Row({ label, value, muted = false, error, badge, testId }: RowProps) {
  const state = badge ? "" : error ? " is-error" : muted ? " is-muted" : "";
  return (
    <div class="evcc-consumers-row">
      <span class="evcc-consumers-label">{label}</span>
      <span
        class={`evcc-consumers-value${state}`}
        data-testid={testId}
        title={badge ? undefined : error}
      >
        {badge ? (
          <span
            class="badge rounded-pill evcc-consumers-badge"
            data-testid="consumer-offline"
            title={error}
          >
            {badge}
          </span>
        ) : (
          value
        )}
      </span>
    </div>
  );
}
