// Modal „Addon hinzufügen“: Katalog mit Installations-Buttons, Upload einer ZIP über [⇪]
import { useState } from "preact/hooks";
import type { CatalogEntry, ManagerClient } from "../addons-client.js";
import { localize, t } from "../i18n.js";
import { UPLOAD_ICON } from "../icons.js";
import { CatalogItem } from "./CatalogItem.js";
import { errorText, isUnauthorized } from "./errors.js";
import { InstallForm, RELOAD_DELAY_MS, successText, type InstallFeedback } from "./InstallForm.js";
import { Modal } from "./Modal.js";
import { useLoadable, type Loadable } from "./useLoadable.js";

export interface CatalogModalProps {
  locale: string;
  client: ManagerClient;
  reload: () => void;
  onUnauthorized: () => void;
  onClose: () => void;
}

/** Installation eines Eintrags; nach Erfolg bleibt busyId bis zum Neuladen gesetzt */
function useCatalogInstall(props: CatalogModalProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, InstallFeedback>>({});
  const install = async (id: string) => {
    setBusyId(id);
    setFeedback({});
    try {
      const result = await props.client.installFromCatalog(id);
      setFeedback({ [id]: { kind: "success", text: successText(result, props.locale) } });
      setTimeout(props.reload, RELOAD_DELAY_MS);
    } catch (err) {
      setBusyId(null);
      if (isUnauthorized(err)) {
        props.onClose();
        return props.onUnauthorized();
      }
      setFeedback({ [id]: { kind: "error", text: errorText(err, props.locale) } });
    }
  };
  return { busyId, feedback, install };
}

export function CatalogModal(props: CatalogModalProps) {
  const { locale, client } = props;
  const catalog = useLoadable(() => client.listCatalog(), []);
  const { busyId, feedback, install } = useCatalogInstall(props);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const close = () => busyId === null && !uploadBusy && props.onClose();
  const unauthorized = () => {
    props.onClose();
    props.onUnauthorized();
  };
  return (
    <Modal
      title={t("catalog.title", locale)}
      titleId="addons-catalog-title"
      testId="catalog-modal"
      closeTestId="catalog-close"
      closeLabel={t("manager.settings.close", locale)}
      size="lg"
      onClose={close}
      headerActions={
        <UploadToggle
          locale={locale}
          open={uploadOpen}
          disabled={uploadBusy}
          onToggle={() => setUploadOpen((open) => !open)}
        />
      }
    >
      {uploadOpen && (
        <InstallForm
          locale={locale}
          install={(file) => client.installAddon(file)}
          reload={props.reload}
          onUnauthorized={unauthorized}
          onBusyChange={setUploadBusy}
          disabled={busyId !== null}
        />
      )}
      <CatalogList
        catalog={catalog}
        locale={locale}
        busyId={busyId}
        feedback={feedback}
        disabled={busyId !== null || uploadBusy}
        onInstall={(id) => void install(id)}
      />
    </Modal>
  );
}

interface UploadToggleProps {
  locale: string;
  open: boolean;
  /** Ein laufender Upload lässt sich nicht ausblenden */
  disabled: boolean;
  onToggle: () => void;
}

/** Icon-Button [⇪] im Kopf; hervorgehoben, solange der Upload eingeblendet ist */
function UploadToggle({ locale, open, disabled, onToggle }: UploadToggleProps) {
  const label = t("manager.install.title", locale);
  return (
    <button
      type="button"
      class="btn btn-sm border-0 p-2 evcc-gray evcc-addons-icon-btn"
      data-testid="catalog-upload"
      aria-pressed={open}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onToggle}
      dangerouslySetInnerHTML={{ __html: UPLOAD_ICON }}
    />
  );
}

interface CatalogListProps {
  catalog: Loadable<CatalogEntry[]>;
  locale: string;
  busyId: string | null;
  feedback: Record<string, InstallFeedback>;
  disabled: boolean;
  onInstall: (id: string) => void;
}

function CatalogList({ catalog, locale, busyId, feedback, disabled, onInstall }: CatalogListProps) {
  if (catalog.kind === "loading") return <CatalogHint locale={locale} kind="loading" />;
  if (catalog.kind === "error") {
    return <CatalogHint locale={locale} kind="load-error" message={catalog.message} />;
  }
  if (catalog.value.length === 0) return <CatalogHint locale={locale} kind="empty" />;
  return (
    <>
      {sortByName(catalog.value, locale).map((entry) => (
        <CatalogItem
          key={entry.id}
          entry={entry}
          locale={locale}
          disabled={disabled}
          busy={busyId === entry.id}
          feedback={feedback[entry.id]}
          onInstall={() => onInstall(entry.id)}
        />
      ))}
    </>
  );
}

function sortByName(entries: CatalogEntry[], locale: string): CatalogEntry[] {
  const name = (entry: CatalogEntry) => localize(entry.name, locale);
  return [...entries].sort((a, b) => name(a).localeCompare(name(b), locale));
}

interface CatalogHintProps {
  locale: string;
  kind: "loading" | "load-error" | "empty";
  message?: string;
}

function CatalogHint({ locale, kind, message = "" }: CatalogHintProps) {
  if (kind === "load-error") {
    return (
      <div class="alert alert-danger mb-0" data-testid="catalog-load-error">
        {t("catalog.loadError", locale, { message })}
      </div>
    );
  }
  const key = kind === "loading" ? "catalog.loading" : "catalog.empty";
  return (
    <p class="text-muted mb-0" data-testid={`catalog-${kind}`}>
      {t(key, locale)}
    </p>
  );
}
