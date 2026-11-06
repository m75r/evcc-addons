// Seite „Addons“ (#/addons): Sitzung, Installation und Liste der Addons
import { useCallback, useEffect, useState } from "preact/hooks";
import type { AddonInfo, ManagerClient, Session } from "../addons-client.js";
import { t, type MessageKey } from "../i18n.js";
import { AddonCard, type AddonActions } from "./AddonCard.js";
import { InstallForm } from "./InstallForm.js";
import { LoginForm } from "./LoginForm.js";

export interface ManagerPageProps {
  locale: string;
  coreErrors: readonly string[];
  client: ManagerClient;
  /** Wartet, bis die Addons gestartet sind und ihren Status gemeldet haben */
  whenLoaded: Promise<void>;
  reload: () => void;
  confirm: (message: string) => boolean;
}

type Loadable<T> =
  { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; value: T };

function useLoadable<T>(load: () => Promise<T>, deps: unknown[]): Loadable<T> {
  const [state, setState] = useState<Loadable<T>>({ kind: "loading" });
  useEffect(() => {
    let active = true;
    load().then(
      (value) => active && setState({ kind: "ready", value }),
      (err: unknown) => active && setState({ kind: "error", message: (err as Error).message }),
    );
    return () => void (active = false);
    // Neu geladen wird nur bei Änderung von deps (wie useEffect)
  }, deps);
  return state;
}

/** Sitzung beim Betreten der Seite und beim Sichtbarwerden des Tabs neu laden */
function useSession(client: ManagerClient): [Loadable<Session>, () => void] {
  const [generation, setGeneration] = useState(0);
  const refresh = useCallback(() => setGeneration((n) => n + 1), []);
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);
  return [useLoadable(() => client.getSession(), [generation]), refresh];
}

export function ManagerPage(props: ManagerPageProps) {
  const { locale, client } = props;
  const [session] = useSession(client);
  const [forceLogin, setForceLogin] = useState(false);
  const addons = useLoadable(async () => {
    await props.whenLoaded;
    return client.listAddons();
  }, []);
  const canManage = !forceLogin && session.kind === "ready" && session.value.canManage;
  const reason = forceLogin
    ? "login-required"
    : session.kind === "ready"
      ? session.value.reason
      : null;
  const actions: AddonActions = {
    setEnabled: (id, enabled) => client.setAddonEnabled(id, enabled),
    uninstall: (id) => client.uninstallAddon(id),
    confirm: (message) => props.confirm(message),
    reload: () => props.reload(),
    onUnauthorized: () => setForceLogin(true),
  };
  return (
    <div data-testid="addons-manager">
      <PageHeader locale={locale} />
      {props.coreErrors.map((message) => (
        <div class="alert alert-danger" key={message}>
          {t("core.error", locale)} {message}
        </div>
      ))}
      {canManage && (
        <InstallForm
          locale={locale}
          install={(file) => client.installAddon(file)}
          reload={props.reload}
          onUnauthorized={actions.onUnauthorized}
        />
      )}
      {reason === "login-required" && (
        <LoginForm locale={locale} login={(pw) => client.login(pw)} reload={props.reload} />
      )}
      {reason && reason !== "login-required" && (
        <div class="alert alert-warning" data-testid="addons-session-hint">
          {t(`session.${reason}` as MessageKey, locale)}
        </div>
      )}
      <AddonList list={addons} locale={locale} canManage={canManage} actions={actions} />
    </div>
  );
}

function PageHeader({ locale }: { locale: string }) {
  return (
    <header class="d-flex justify-content-between align-items-center py-3 py-md-4">
      <div class="title position-relative flex-grow-1 mb-1">
        <h1 class="mb-0 pt-1 text-truncate">{t("addons.title", locale)}</h1>
      </div>
    </header>
  );
}

interface AddonListProps {
  list: Loadable<AddonInfo[]>;
  locale: string;
  canManage: boolean;
  actions: AddonActions;
}

function AddonList({ list, locale, canManage, actions }: AddonListProps) {
  if (list.kind === "loading") return <p class="text-muted">{t("manager.loading", locale)}</p>;
  if (list.kind === "error") {
    return (
      <div class="alert alert-danger" data-testid="addons-load-error">
        {t("manager.loadError", locale, { message: list.message })}
      </div>
    );
  }
  if (list.value.length === 0) {
    return (
      <p class="text-muted" data-testid="addons-empty">
        {t("addons.empty", locale)}
      </p>
    );
  }
  return (
    <section>
      <h2 class="h6 text-uppercase text-muted fw-normal mb-3">{t("manager.installed", locale)}</h2>
      {list.value.map((addon) => (
        <AddonCard
          key={addon.id}
          addon={addon}
          locale={locale}
          canManage={canManage}
          actions={actions}
        />
      ))}
    </section>
  );
}
