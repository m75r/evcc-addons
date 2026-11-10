// Popup „evcc-addons aktualisieren“: installierte und verfügbare Version, Prüfung, Installation über den
// Root-Updater mit Fortschritt oder der manuelle Weg
import { ApiError, type ManagerClient, type PlatformInfo } from "../addons-client.js";
import { t, type MessageKey } from "../i18n.js";
import { errorText } from "./errors.js";
import { Modal } from "./Modal.js";
import type { Loadable } from "./useLoadable.js";
import { isUpdateBusy, usePlatformUpdate, type UpdatePhase } from "./usePlatformUpdate.js";

export interface PlatformModalProps {
  locale: string;
  /** null, solange keine Admin-Sitzung besteht */
  platform: Loadable<PlatformInfo | null>;
  /** Erstes Laden oder „Jetzt prüfen“ läuft */
  checking: boolean;
  onRefresh: () => void;
  onClose: () => void;
  client: ManagerClient;
  reload: () => void;
  onUnauthorized: () => void;
}

type Latest = NonNullable<PlatformInfo["latest"]>;

/** Dateiname des .deb in Debian-Schreibweise wie nfpm (erstes "-" → "~") */
export function debFileName(version: string): string {
  return `evcc-addons_${version.replace("-", "~")}_all.deb`;
}

/** Neuere Version, die der Root-Updater installieren kann, sonst null */
function installableRelease(platform: Loadable<PlatformInfo | null>): Latest | null {
  if (platform.kind !== "ready" || platform.value === null) return null;
  const { canInstall, updateAvailable, latest } = platform.value;
  return canInstall && updateAvailable && latest?.downloadUrl ? latest : null;
}

export function PlatformModal(props: PlatformModalProps) {
  const { locale } = props;
  const target = installableRelease(props.platform);
  const update = usePlatformUpdate({
    client: props.client,
    reload: props.reload,
    target: target?.version ?? null,
    locale,
    onUnauthorized: props.onUnauthorized,
  });
  const busy = isUpdateBusy(update.phase);
  return (
    <Modal
      title={t("platform.title", locale)}
      titleId="addons-platform-title"
      testId="platform-modal"
      closeTestId="platform-close"
      closeLabel={t("manager.settings.close", locale)}
      onClose={() => !busy && props.onClose()}
    >
      <PlatformBody {...props} installable={target !== null} />
      <UpdateFeedback locale={locale} {...update} version={target?.version ?? ""} />
      <PlatformFooter
        locale={locale}
        checkDisabled={props.checking || busy}
        update={target && { disabled: busy, onClick: update.start }}
        onRefresh={props.onRefresh}
      />
    </Modal>
  );
}

interface FooterProps {
  locale: string;
  checkDisabled: boolean;
  /** Button „Aktualisieren“ nur mit installierbarem Release */
  update: { disabled: boolean; onClick: () => void } | null;
  onRefresh: () => void;
}

function PlatformFooter({ locale, checkDisabled, update, onRefresh }: FooterProps) {
  return (
    <div class="d-flex justify-content-between gap-2 mt-3">
      <button
        type="button"
        class="btn btn-outline-secondary"
        data-testid="platform-check"
        disabled={checkDisabled}
        onClick={onRefresh}
      >
        {t("platform.check", locale)}
      </button>
      {update && (
        <button
          type="button"
          class="btn btn-primary"
          data-testid="platform-update"
          disabled={update.disabled}
          onClick={update.onClick}
        >
          {t("platform.update", locale)}
        </button>
      )}
    </div>
  );
}

interface FeedbackProps {
  locale: string;
  phase: UpdatePhase;
  error: string | null;
  version: string;
}

/** Fortschritt mit Spinner während der Installation, danach ggf. Fehler mit Hinweis auf das Journal */
function UpdateFeedback({ locale, phase, error, version }: FeedbackProps) {
  if (isUpdateBusy(phase)) {
    return (
      <div class="d-flex align-items-center gap-2 mt-3" data-testid="platform-progress">
        <span class="spinner-border spinner-border-sm" aria-hidden="true" />
        <span role="status">{t(`platform.phase.${phase}` as MessageKey, locale, { version })}</span>
      </div>
    );
  }
  if (phase !== "failed" && phase !== "timeout") return null;
  const text =
    phase === "timeout"
      ? t("platform.timeout", locale)
      : t("platform.failed", locale, { message: error ?? "" });
  return (
    <div class="text-danger mt-3" data-testid="platform-failed">
      <div>{text}</div>
      <div class="small">{t("platform.journal", locale)}</div>
    </div>
  );
}

interface BodyProps extends PlatformModalProps {
  installable: boolean;
}

function PlatformBody({ locale, platform, checking, installable }: BodyProps) {
  if (checking || platform.kind === "loading") {
    return (
      <p class="text-muted mb-0" data-testid="platform-checking">
        {t("platform.checking", locale)}
      </p>
    );
  }
  if (platform.kind === "error") return <CheckError locale={locale} error={platform.error} />;
  const info = platform.value;
  if (info === null) return null;
  if (info.checkError) {
    const { code, message } = info.checkError;
    return <CheckError locale={locale} error={new ApiError(502, code, message)} />;
  }
  return <PlatformState locale={locale} info={info} installable={installable} />;
}

function CheckError({ locale, error }: { locale: string; error: unknown }) {
  return (
    <div class="text-danger" data-testid="platform-check-error">
      {t("platform.checkError", locale, { message: errorText(error, locale) })}
    </div>
  );
}

interface StateProps {
  locale: string;
  info: PlatformInfo;
  installable: boolean;
}

function PlatformState({ locale, info, installable }: StateProps) {
  if (!info.updateAvailable || !info.latest) {
    return (
      <p class="mb-0" data-testid="platform-up-to-date">
        {t("platform.upToDate", locale, { version: info.current })}
      </p>
    );
  }
  return (
    <>
      <PlatformVersions locale={locale} current={info.current} latest={info.latest} />
      {installable ? (
        <p class="mb-0" data-testid="platform-restart-hint">
          {t("platform.restartHint", locale)}
        </p>
      ) : (
        <ManualInstall locale={locale} latest={info.latest} />
      )}
    </>
  );
}

interface VersionsProps {
  locale: string;
  current: string;
  latest: Latest;
}

function PlatformVersions({ locale, current, latest }: VersionsProps) {
  const date = formatDate(latest.publishedAt, locale);
  return (
    <>
      <dl class="row mb-2">
        <dt class="col-4 fw-normal text-muted">{t("platform.installed", locale)}</dt>
        <dd class="col-8 mb-1" data-testid="platform-current">
          v{current}
        </dd>
        <dt class="col-4 fw-normal text-muted">{t("platform.available", locale)}</dt>
        <dd class="col-8 mb-1">
          <span data-testid="platform-latest">v{latest.version}</span>{" "}
          <span class="text-muted">({t("platform.published", locale, { date })})</span>
        </dd>
      </dl>
      <p>
        <ExternalLink href={latest.notesUrl} testId="platform-notes">
          {t("platform.notes", locale)}
        </ExternalLink>
      </p>
    </>
  );
}

function formatDate(iso: string, locale: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString(locale);
}

/** Ohne downloadUrl liegt das Paket bei den Versionshinweisen (Link darüber) */
function ManualInstall({ locale, latest }: { locale: string; latest: Latest }) {
  return (
    <div data-testid="platform-manual">
      <p class="mb-2">{t("platform.manual", locale)}</p>
      {latest.downloadUrl && (
        <p class="mb-1">
          <ExternalLink href={latest.downloadUrl} testId="platform-download">
            {t("platform.download", locale)}
          </ExternalLink>{" "}
          {t("platform.manualCommand", locale)}
        </p>
      )}
      <code class="d-block user-select-all" data-testid="platform-command">
        sudo apt install ./{debFileName(latest.version)}
      </code>
    </div>
  );
}

interface LinkProps {
  href: string;
  testId: string;
  children: string;
}

function ExternalLink({ href, testId, children }: LinkProps) {
  return (
    <a href={href} target="_blank" rel="noopener" data-testid={testId}>
      {children} ↗
    </a>
  );
}
