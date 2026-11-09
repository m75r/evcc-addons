// Dialog eines Addons (api.addManagerDialog): Rahmen vom Loader, Inhalt mountet das Addon
import type { ManagerDialogContext } from "@evcc-addons/sdk";
import { useEffect, useRef, useState } from "preact/hooks";
import { localize, t } from "../i18n.js";
import { errorText } from "../page/host.js";
import type { ManagerDialogEntry } from "./dialogs.js";
import { Modal } from "./Modal.js";

export interface AddonDialogProps {
  addonId: string;
  index: number;
  entry: ManagerDialogEntry;
  locale: string;
  canManage: boolean;
  confirm: (message: string) => boolean;
  onUnauthorized: () => void;
  onClose: () => void;
}

/** Mountet den Inhalt; neu bei geändertem Login oder Sprache, Aufräumen beim Schließen */
function useDialogContent(props: AddonDialogProps, setError: (message: string) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const { entry, canManage, locale } = props;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cleanup: void | (() => void);
    try {
      cleanup = entry.def.mount(el, dialogContext(props));
    } catch (err) {
      setError(errorText(err));
      entry.onError(err);
      return;
    }
    return () => unmount(el, cleanup, entry);
  }, [canManage, locale]);
  return ref;
}

function dialogContext(props: AddonDialogProps): ManagerDialogContext {
  return {
    locale: props.locale,
    canManage: props.canManage,
    confirm: (message) => props.confirm(message),
    onUnauthorized: () => {
      props.onClose();
      props.onUnauthorized();
    },
    close: () => props.onClose(),
  };
}

function unmount(el: HTMLElement, cleanup: void | (() => void), entry: ManagerDialogEntry): void {
  try {
    cleanup?.();
  } catch (err) {
    entry.onError(err);
  }
  el.replaceChildren();
}

export function AddonDialog(props: AddonDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const content = useDialogContent(props, setError);
  const { addonId, index, entry, locale } = props;
  return (
    <Modal
      title={localize(entry.def.title, locale)}
      titleId={`addon-dialog-title-${addonId}-${index}`}
      testId="addon-dialog-modal"
      closeTestId="addon-dialog-close"
      closeLabel={t("manager.settings.close", locale)}
      size="lg"
      onClose={props.onClose}
    >
      {error && (
        <div class="text-danger small" data-testid="addon-dialog-error">
          ⚠ {t("manager.dialog.mountError", locale, { message: error })}
        </div>
      )}
      <div ref={content} data-testid={`addon-dialog-content-${addonId}`} />
    </Modal>
  );
}
