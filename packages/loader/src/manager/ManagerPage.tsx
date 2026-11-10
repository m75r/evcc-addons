// Seite „Addons“ (#/addons): Sitzung, Installation und Liste der Addons
import { useCallback, useEffect, useState } from "preact/hooks";
import type {
  AddonInfo,
  ManagerClient,
  PlatformInfo,
  Session,
  SessionReason,
} from "../addons-client.js";
import { t, type MessageKey } from "../i18n.js";
import { AddonCard, type AddonActions } from "./AddonCard.js";
import type { ManagerDialogRegistry } from "./dialogs.js";
import { CatalogModal } from "./CatalogModal.js";
import { isUnauthorized } from "./errors.js";
import { LoginForm } from "./LoginForm.js";
import { NewButton } from "./NewButton.js";
import { PlatformModal } from "./PlatformModal.js";
import { PlatformVersion } from "./PlatformVersion.js";
import { useLoadable, type Loadable } from "./useLoadable.js";

export interface ManagerPageProps {
  locale: string;
  coreErrors: readonly string[];
  client: ManagerClient;
  /** Wartet, bis die Addons gestartet sind und ihren Status gemeldet haben */
  whenLoaded: Promise<void>;
  reload: () => void;
  confirm: (message: string) => boolean;
  /** Gespeicherte Einstellungen an die laufenden Addons weitergeben */
  onSettingsSaved: (addon: AddonInfo) => void;
  /** Laufende Version von evcc-addons, null wenn unbekannt */
  version: string | null;
  /** Dialoge der Addons (api.addManagerDialog) */
  dialogs: ManagerDialogRegistry;
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

interface PlatformState {
  platform: Loadable<PlatformInfo | null>;
  /** Erstes Laden oder „Jetzt prüfen“ läuft */
  checking: boolean;
  refresh: () => void;
}

/** Update-Prüfung nur mit Admin-Sitzung; 401 führt zum Login-Formular */
function usePlatform(
  client: ManagerClient,
  canManage: boolean,
  onUnauthorized: () => void,
): PlatformState {
  const [generation, setGeneration] = useState(0);
  const [settled, setSettled] = useState(-1);
  const platform = useLoadable(() => {
    if (!canManage) return Promise.resolve(null);
    const done = () => setSettled((last) => Math.max(last, generation));
    return client.getPlatform(generation > 0).finally(done);
  }, [canManage, generation]);
  const unauthorized = platform.kind === "error" && isUnauthorized(platform.error);
  useEffect(() => void (unauthorized && onUnauthorized()), [unauthorized]);
  const refresh = useCallback(() => setGeneration((n) => n + 1), []);
  return { platform, checking: canManage && settled < generation, refresh };
}

export function ManagerPage(props: ManagerPageProps) {
  const { locale, client } = props;
  const [session] = useSession(client);
  const [forceLogin, setForceLogin] = useState(false);
  const addons = useLoadable(async () => {
    await props.whenLoaded;
    return client.listAddons();
  }, []);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [platformOpen, setPlatformOpen] = useState(false);
  const canManage = !forceLogin && session.kind === "ready" && session.value.canManage;
  const showCatalog = canManage && catalogOpen;
  const platform = usePlatform(client, canManage, () => setForceLogin(true));
  const reason = forceLogin
    ? "login-required"
    : session.kind === "ready"
      ? session.value.reason
      : null;
  const actions: AddonActions = {
    setEnabled: (id, enabled) => client.setAddonEnabled(id, enabled),
    uninstall: (id) => client.uninstallAddon(id),
    saveSettings: (id, values) => client.saveAddonSettings(id, values),
    onSettingsSaved: (addon) => props.onSettingsSaved(addon),
    confirm: (message) => props.confirm(message),
    reload: () => props.reload(),
    onUnauthorized: () => setForceLogin(true),
  };
  return (
    <div data-testid="addons-manager">
      <PageHeader
        locale={locale}
        version={props.version}
        canManage={canManage}
        updateAvailable={updateAvailable(platform.platform)}
        newOpen={showCatalog}
        onNew={() => setCatalogOpen(true)}
        onPlatform={() => setPlatformOpen(true)}
      />
      <p class="text-muted mb-4" data-testid="addons-subtitle">
        {t("addons.subtitle", locale)}
      </p>
      {props.coreErrors.map((message) => (
        <div class="alert alert-danger" key={message}>
          {t("core.error", locale)} {message}
        </div>
      ))}
      {showCatalog && (
        <CatalogModal
          locale={locale}
          client={client}
          reload={props.reload}
          onUnauthorized={actions.onUnauthorized}
          onClose={() => setCatalogOpen(false)}
        />
      )}
      {canManage && platformOpen && (
        <PlatformModal
          locale={locale}
          platform={platform.platform}
          checking={platform.checking}
          onRefresh={platform.refresh}
          onClose={() => setPlatformOpen(false)}
          client={client}
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
      <AddonList
        list={addons}
        locale={locale}
        canManage={canManage}
        reason={reason}
        actions={actions}
        dialogs={props.dialogs}
      />
    </div>
  );
}

/** Badge nur nach erfolgreicher Prüfung mit neuerer Version */
function updateAvailable(platform: Loadable<PlatformInfo | null>): boolean {
  return platform.kind === "ready" && platform.value?.updateAvailable === true;
}

interface PageHeaderProps {
  locale: string;
  version: string | null;
  /** „+ Neu“, Versions-Button und Badge nur mit Admin-Login */
  canManage: boolean;
  updateAvailable: boolean;
  newOpen: boolean;
  onNew: () => void;
  onPlatform: () => void;
}

function PageHeader(props: PageHeaderProps) {
  const { locale, version } = props;
  return (
    <header class="d-flex justify-content-between align-items-center gap-3 py-3 py-md-4">
      <div class="title position-relative flex-grow-1 min-w-0 mb-1">
        <h1 class="mb-0 pt-1 text-truncate">
          {t("addons.title", locale)}
          {version && (
            <PlatformVersion
              locale={locale}
              version={version}
              canManage={props.canManage}
              updateAvailable={props.updateAvailable}
              onOpen={props.onPlatform}
            />
          )}
        </h1>
      </div>
      {props.canManage && (
        <NewButton
          label={t("manager.new", locale)}
          testId="addons-new"
          open={props.newOpen}
          onClick={props.onNew}
        />
      )}
    </header>
  );
}

interface AddonListProps {
  list: Loadable<AddonInfo[]>;
  locale: string;
  canManage: boolean;
  reason: SessionReason | null;
  actions: AddonActions;
  dialogs: ManagerDialogRegistry;
}

function AddonList({ list, locale, canManage, reason, actions, dialogs }: AddonListProps) {
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
          reason={reason}
          actions={actions}
          dialogs={dialogs.list(addon.id)}
        />
      ))}
    </section>
  );
}
