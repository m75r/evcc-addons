// Version von evcc-addons neben dem Titel; für Admins ein Button zum Popup, dahinter ggf. das Badge
import { t } from "../i18n.js";

export interface PlatformVersionProps {
  locale: string;
  version: string;
  /** Nur Admins sehen Button und Badge */
  canManage: boolean;
  updateAvailable: boolean;
  onOpen: () => void;
}

export function PlatformVersion(props: PlatformVersionProps) {
  const { locale, version } = props;
  if (!props.canManage) {
    return (
      <span class="text-muted ms-2 evcc-addons-version" data-testid="addons-version">
        v{version}
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        class="btn btn-link p-0 text-muted ms-2 evcc-addons-version evcc-addons-version-btn"
        data-testid="addons-version"
        aria-label={t("platform.versionLabel", locale)}
        title={t("platform.versionLabel", locale)}
        onClick={props.onOpen}
      >
        v{version}
      </button>
      {props.updateAvailable && <UpdateBadge locale={locale} onOpen={props.onOpen} />}
    </>
  );
}

function UpdateBadge({ locale, onOpen }: { locale: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      class="badge rounded-pill bg-primary border-0 ms-2 evcc-addons-update-badge"
      data-testid="addons-update-badge"
      onClick={onOpen}
    >
      {t("platform.badge", locale)}
    </button>
  );
}
