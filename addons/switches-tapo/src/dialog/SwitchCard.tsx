// Karte einer Steckdose: Status, gebundenes Gerät, Warnungen; für Admins Adresse, YAML und Aktionen
import { useRef, useState } from "preact/hooks";
import { t } from "../i18n.js";
import { errorText } from "../ui/errors.js";
import { useAction } from "../ui/useAction.js";
import type { SwitchInfo, SwitchStatus } from "./client.js";
import { selectContents } from "./clipboard.js";
import { buildYaml } from "./switch-yaml.js";

export interface SwitchActions {
  edit: (info: SwitchInfo) => void;
  remove: (id: string) => Promise<void>;
  renewToken: (id: string) => Promise<string>;
  copy: (text: string) => Promise<void>;
  confirm: (message: string) => boolean;
  reload: () => void;
  onUnauthorized: () => void;
}

export interface SwitchCardProps {
  info: SwitchInfo;
  locale: string;
  canManage: boolean;
  /** Basis für die Gateway-URLs (Adresse aus der Browserzeile) */
  pageBase: string;
  actions: SwitchActions;
}

export function statusText(status: SwitchStatus, locale: string): string {
  if (status.reachable === null) return t("switches.reading", locale);
  if (status.reachable === false) {
    return t("switches.unreachable", locale, { message: status.error ?? "" });
  }
  if (!status.on) return `○ ${t("switches.off", locale)}`;
  const power = status.power === null ? "" : ` · ${Math.round(status.power)} W`;
  return `● ${t("switches.on", locale)}${power}`;
}

export function SwitchCard(props: SwitchCardProps) {
  const { info, locale, canManage, actions } = props;
  const { busy, error, run } = useAction(actions, locale);
  const [yamlOpen, setYamlOpen] = useState(false);
  const remove = () => {
    const message = t("switches.delete.confirm", locale, { name: info.name });
    if (actions.confirm(message)) void run(() => actions.remove(info.id));
  };
  const renew = () => {
    if (actions.confirm(t("switches.renew.confirm", locale))) {
      void run(() => actions.renewToken(info.id));
    }
  };
  return (
    <div class="round-box mb-3" data-testid={`switch-card-${info.id}`}>
      <SwitchHeader {...props} />
      <SwitchWarnings info={info} locale={locale} actionError={error} />
      {canManage && (
        <SwitchButtons
          locale={locale}
          busy={busy}
          yamlOpen={yamlOpen}
          onToggleYaml={() => setYamlOpen((open) => !open)}
          onEdit={() => actions.edit(info)}
          onDelete={remove}
        />
      )}
      {canManage && yamlOpen && info.token && <YamlPanel {...props} busy={busy} onRenew={renew} />}
    </div>
  );
}

function SwitchHeader({ info, locale, canManage }: SwitchCardProps) {
  const unreachable = info.status.reachable === false;
  return (
    <>
      <div class="d-flex align-items-start justify-content-between gap-3">
        <strong class="d-block text-truncate">{info.name}</strong>
        {canManage && info.host && (
          <span class="text-muted small text-nowrap pt-1" data-testid="switch-host">
            Tapo · {info.host}
          </span>
        )}
      </div>
      <div class="small">
        <span class={unreachable ? "text-danger" : ""} data-testid="switch-status">
          {statusText(info.status, locale)}
        </span>
        <span class="text-muted" data-testid="switch-target">
          {" · "}
          {t(
            info.target.kind === "loadpoint" ? "switches.loadpoint" : "switches.consumer",
            locale,
            {
              title: info.target.title,
            },
          )}
        </span>
      </div>
    </>
  );
}

interface WarningsProps {
  info: SwitchInfo;
  locale: string;
  actionError: string | null;
}

function SwitchWarnings({ info, locale, actionError }: WarningsProps) {
  return (
    <>
      {info.targetFound === false && (
        <div class="text-warning small mt-1" data-testid="switch-target-warning">
          ⚠{" "}
          {t(
            info.target.kind === "loadpoint"
              ? "switches.loadpointMissing"
              : "switches.consumerMissing",
            locale,
          )}
        </div>
      )}
      {info.target.kind === "loadpoint" && info.status.modeError && (
        <div class="text-warning small mt-1" data-testid="switch-mode-warning">
          ⚠ {t("switches.modeError", locale, { message: info.status.modeError })}
        </div>
      )}
      {actionError && (
        <div class="text-danger small mt-2" data-testid="switch-action-error">
          {actionError}
        </div>
      )}
    </>
  );
}

interface ButtonsProps {
  locale: string;
  busy: boolean;
  yamlOpen: boolean;
  onToggleYaml: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function SwitchButtons(props: ButtonsProps) {
  const { locale, busy } = props;
  return (
    <div class="d-flex flex-wrap justify-content-end gap-2 mt-2">
      <button
        type="button"
        class={`btn btn-sm btn-outline-secondary${props.yamlOpen ? " active" : ""}`}
        data-testid="switch-yaml-toggle"
        aria-expanded={props.yamlOpen}
        onClick={props.onToggleYaml}
      >
        {t("switches.yaml", locale)}
      </button>
      <button
        type="button"
        class="btn btn-sm btn-outline-secondary"
        data-testid="switch-edit"
        disabled={busy}
        onClick={props.onEdit}
      >
        {t("switches.edit", locale)}
      </button>
      <button
        type="button"
        class="btn btn-sm btn-outline-danger"
        data-testid="switch-delete"
        disabled={busy}
        onClick={props.onDelete}
      >
        {t("switches.delete", locale)}
      </button>
    </div>
  );
}

interface YamlPanelProps extends SwitchCardProps {
  busy: boolean;
  onRenew: () => void;
}

/** YAML mit Kopieren und Token erneuern; Hinweis zur Proxy-Adresse */
function YamlPanel({ info, locale, pageBase, actions, busy, onRenew }: YamlPanelProps) {
  const yaml = buildYaml(info, pageBase);
  const [copied, setCopied] = useState<string | null>(null);
  const pre = useRef<HTMLPreElement>(null);
  const copy = async () => {
    try {
      await actions.copy(yaml);
      setCopied(t("switches.copied", locale));
    } catch (err) {
      // Ohne Zwischenablage bleibt der markierte Text zum Kopieren von Hand
      if (pre.current) selectContents(pre.current);
      setCopied(t("switches.copyError", locale, { message: errorText(err) }));
    }
  };
  return (
    <div class="mt-3">
      <pre
        ref={pre}
        class="evcc-switches-tapo-yaml small p-2 mb-2 rounded"
        data-testid="switch-yaml"
      >
        {yaml}
      </pre>
      <div class="d-flex flex-wrap align-items-center gap-2">
        <button
          type="button"
          class="btn btn-sm btn-primary"
          data-testid="switch-yaml-copy"
          onClick={() => void copy()}
        >
          {t("switches.copy", locale)}
        </button>
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary"
          data-testid="switch-token-renew"
          disabled={busy}
          onClick={onRenew}
        >
          {t("switches.renew", locale)}
        </button>
        {copied && (
          <span class="small text-muted" data-testid="switch-yaml-copied">
            {copied}
          </span>
        )}
      </div>
      <p class="text-muted small mt-2 mb-0" data-testid="switch-yaml-hint">
        {info.target.kind === "loadpoint"
          ? t("switches.yamlHint", locale, { local: localAddress(pageBase) })
          : t("switches.meterYamlHint", locale, {
              title: info.target.title,
              local: localAddress(pageBase),
            })}
      </p>
    </div>
  );
}

/** Gleiche Adresse mit 127.0.0.1 statt Hostname, falls evcc auf demselben Rechner läuft */
function localAddress(pageBase: string): string {
  const url = new URL(pageBase);
  url.hostname = "127.0.0.1";
  return url.origin;
}
