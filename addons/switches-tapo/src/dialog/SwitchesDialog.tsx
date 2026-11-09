// Inhalt des Dialogs „Tapo-Steckdosen“: Liste der Steckdosen ↔ Formular im selben Rahmen
// (aus packages/loader/src/manager/SwitchSection.tsx)
import { useState } from "preact/hooks";
import { t } from "../i18n.js";
import type { SwitchListState, SwitchListStore } from "../switch-list.js";
import { errorText } from "../ui/errors.js";
import { NewButton } from "../ui/NewButton.js";
import { useSwitchList } from "../ui/useSwitchList.js";
import type { SwitchClient, SwitchInfo } from "./client.js";
import { copyText } from "./clipboard.js";
import { MigrationHint } from "./MigrationHint.js";
import { SwitchCard, type SwitchActions } from "./SwitchCard.js";
import { SwitchForm } from "./SwitchForm.js";

export interface SwitchesDialogProps {
  locale: string;
  canManage: boolean;
  confirm: (message: string) => boolean;
  onUnauthorized: () => void;
  client: SwitchClient;
  store: SwitchListStore;
  /** null ohne Zugriff auf localStorage */
  storage: Storage | null;
  /** Standard: Adresse der aktuellen Seite */
  pageBase?: string;
  /** Standard: Zwischenablage, über HTTP mit Rückfall auf execCommand */
  copy?: (text: string) => Promise<void>;
}

/** Ansicht im Dialog; `initial: null` legt neu an */
type View = { kind: "list" } | { kind: "form"; initial: SwitchInfo | null };

export function SwitchesDialog(props: SwitchesDialogProps) {
  const { locale, client, canManage, store } = props;
  const list = useSwitchList(store);
  const [view, setView] = useState<View>({ kind: "list" });
  const refresh = () => void store.refresh();
  if (canManage && view.kind === "form") {
    const { initial } = view;
    return (
      <SwitchForm
        key={initial?.id ?? "new"}
        locale={locale}
        initial={initial}
        loadDevices={() => client.listEvccDevices()}
        loadHosts={() => client.listDeviceHosts()}
        save={(input) =>
          initial ? client.updateSwitch(initial.id, input) : client.createSwitch(input)
        }
        onBack={(changed) => {
          setView({ kind: "list" });
          if (changed) refresh();
        }}
        onUnauthorized={props.onUnauthorized}
      />
    );
  }
  return (
    <ListView {...props} list={list} onEdit={(initial) => setView({ kind: "form", initial })} />
  );
}

interface ListViewProps extends SwitchesDialogProps {
  list: SwitchListState;
  onEdit: (initial: SwitchInfo | null) => void;
}

function ListView(props: ListViewProps) {
  const { locale, canManage, list, client } = props;
  const actions: SwitchActions = {
    edit: (info) => props.onEdit(info),
    remove: (id) => client.deleteSwitch(id),
    renewToken: (id) => client.renewSwitchToken(id),
    copy: props.copy ?? copyText,
    confirm: props.confirm,
    reload: () => void props.store.refresh(),
    onUnauthorized: props.onUnauthorized,
  };
  const hasSwitches = list.kind === "ready" && list.value.length > 0;
  return (
    <div data-testid="switches">
      <MigrationHint locale={locale} show={canManage && hasSwitches} storage={props.storage} />
      {canManage && (
        <div class="d-flex justify-content-end mb-3">
          <NewButton
            label={t("switches.new", locale)}
            testId="switches-new"
            onClick={() => props.onEdit(null)}
          />
        </div>
      )}
      <SwitchList {...props} actions={actions} />
    </div>
  );
}

function SwitchList({
  list,
  locale,
  canManage,
  actions,
  ...props
}: ListViewProps & { actions: SwitchActions }) {
  if (list.kind === "loading") return <p class="text-muted">{t("switches.loading", locale)}</p>;
  if (list.kind === "error") {
    return (
      <div class="alert alert-danger" data-testid="switches-load-error">
        {t("switches.loadError", locale, { message: errorText(list.error) })}
      </div>
    );
  }
  if (list.value.length === 0) {
    return (
      <p class="text-muted" data-testid="switches-empty">
        {t("switches.empty", locale)}
      </p>
    );
  }
  const base = props.pageBase ?? window.location.origin + window.location.pathname;
  return (
    <>
      {list.value.map((info) => (
        <SwitchCard
          key={info.id}
          info={info}
          locale={locale}
          canManage={canManage}
          pageBase={base}
          actions={actions}
        />
      ))}
    </>
  );
}
