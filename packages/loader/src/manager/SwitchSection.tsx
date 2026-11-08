// Abschnitt „Steckdosen“ der Seite „Addons“: Liste, Neuladen alle 5 s, Anlegen und Bearbeiten
import { useCallback, useEffect, useState } from "preact/hooks";
import type { ManagerClient, SwitchInfo } from "../addons-client.js";
import { pageBase } from "../evcc-api.js";
import { t } from "../i18n.js";
import { errorText } from "./errors.js";
import { NewButton } from "./NewButton.js";
import { SwitchCard, type SwitchActions } from "./SwitchCard.js";
import { SwitchModal } from "./SwitchModal.js";

export const REFRESH_MS = 5000;

export interface SwitchSectionProps {
  locale: string;
  client: ManagerClient;
  canManage: boolean;
  confirm: (message: string) => boolean;
  onUnauthorized: () => void;
  /** Standard: Adresse der aktuellen Seite */
  pageBase?: string;
  /** Standard: navigator.clipboard */
  copy?: (text: string) => Promise<void>;
}

type SwitchList =
  { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; value: SwitchInfo[] };

/** Lädt beim Start und alle 5 s, solange die Seite sichtbar ist */
function useSwitchList(client: ManagerClient, locale: string): [SwitchList, () => void] {
  const [list, setList] = useState<SwitchList>({ kind: "loading" });
  const refresh = useCallback(() => {
    client.listSwitches().then(
      (value) => setList({ kind: "ready", value }),
      (err: unknown) => setList({ kind: "error", message: errorText(err, locale) }),
    );
  }, [client, locale]);
  useEffect(() => {
    refresh();
    const timer = setInterval(
      () => document.visibilityState === "visible" && refresh(),
      REFRESH_MS,
    );
    return () => clearInterval(timer);
  }, [refresh]);
  return [list, refresh];
}

/** undefined = geschlossen, null = neu anlegen, sonst bearbeiten */
type ModalState = SwitchInfo | null | undefined;

export function SwitchSection(props: SwitchSectionProps) {
  const { locale, client, canManage } = props;
  const [list, refresh] = useSwitchList(client, locale);
  const [modal, setModal] = useState<ModalState>(undefined);
  const actions: SwitchActions = {
    edit: (info) => setModal(info),
    remove: (id) => client.deleteSwitch(id),
    renewToken: (id) => client.renewSwitchToken(id),
    copy: props.copy ?? ((text) => navigator.clipboard.writeText(text)),
    confirm: props.confirm,
    reload: refresh,
    onUnauthorized: props.onUnauthorized,
  };
  const save = (input: Parameters<ManagerClient["createSwitch"]>[0]) =>
    modal ? client.updateSwitch(modal.id, input) : client.createSwitch(input);
  return (
    <section class="mt-4" data-testid="switches">
      <SectionHeader locale={locale} canManage={canManage} onNew={() => setModal(null)} />
      <SwitchListView {...props} list={list} actions={actions} />
      {canManage && modal !== undefined && (
        <SwitchModal
          key={modal?.id ?? "new"}
          locale={locale}
          initial={modal}
          loadTitles={() => client.listLoadpointTitles()}
          save={save}
          onClose={(changed) => {
            setModal(undefined);
            if (changed) refresh();
          }}
          onUnauthorized={props.onUnauthorized}
        />
      )}
    </section>
  );
}

function SectionHeader(props: { locale: string; canManage: boolean; onNew: () => void }) {
  return (
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h2 class="h6 text-uppercase text-muted fw-normal mb-0">
        {t("switches.title", props.locale)}
      </h2>
      {props.canManage && (
        <NewButton
          label={t("switches.new", props.locale)}
          testId="switches-new"
          onClick={props.onNew}
        />
      )}
    </div>
  );
}

interface ListViewProps extends SwitchSectionProps {
  list: SwitchList;
  actions: SwitchActions;
}

function SwitchListView({ list, locale, canManage, actions, ...props }: ListViewProps) {
  if (list.kind === "loading") return <p class="text-muted">{t("switches.loading", locale)}</p>;
  if (list.kind === "error") {
    return (
      <div class="alert alert-danger" data-testid="switches-load-error">
        {t("switches.loadError", locale, { message: list.message })}
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
  const base = props.pageBase ?? pageBase();
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
