// Modal-Rahmen im Markup von evcc GenericModal (ohne Bootstrap-JS): Escape, Backdrop, Fokus
import type { ComponentChildren, RefObject } from "preact";
import { useEffect, useRef } from "preact/hooks";

export interface ModalProps {
  title: string;
  /** Eindeutige id für aria-labelledby */
  titleId: string;
  testId: string;
  closeTestId: string;
  closeLabel: string;
  /** Escape, ✕ und Klick auf den Hintergrund */
  onClose: () => void;
  /** Breiterer Dialog (Bootstrap `modal-lg`) */
  size?: "lg";
  children: ComponentChildren;
}

/** `body.modal-open` wie Bootstrap, Fokus auf den Dialog */
function useModalEffects(dialog: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    document.body.classList.add("modal-open");
    dialog.current?.focus();
    return () => document.body.classList.remove("modal-open");
  }, []);
}

export function Modal(props: ModalProps) {
  const dialog = useRef<HTMLDivElement>(null);
  useModalEffects(dialog);
  return (
    <>
      <div
        ref={dialog}
        class="modal fade show d-block"
        role="dialog"
        aria-modal="true"
        aria-labelledby={props.titleId}
        tabIndex={-1}
        data-testid={props.testId}
        onKeyDown={(e) => e.key === "Escape" && props.onClose()}
        onClick={(e) => e.target === e.currentTarget && props.onClose()}
      >
        <div
          class={`modal-dialog modal-dialog-centered${props.size ? ` modal-${props.size}` : ""}`}
          role="document"
        >
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id={props.titleId}>
                {props.title}
              </h5>
              <button
                type="button"
                class="btn-close"
                data-testid={props.closeTestId}
                aria-label={props.closeLabel}
                onClick={props.onClose}
              />
            </div>
            <div class="modal-body">{props.children}</div>
          </div>
        </div>
      </div>
      <div class="modal-backdrop fade show" />
    </>
  );
}
