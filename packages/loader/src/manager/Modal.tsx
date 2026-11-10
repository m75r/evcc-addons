// Modal-Rahmen im Markup von evcc GenericModal (ohne Bootstrap-JS): Escape, Backdrop, Fokus
import type { ComponentChildren, RefObject } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";

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
  /** Weitere Buttons im Kopf, links neben ✕ */
  headerActions?: ComponentChildren;
  children: ComponentChildren;
}

/**
 * `body.modal-open` wie Bootstrap und Fokus auf den Dialog, beides direkt nach dem Einfügen
 * (useLayoutEffect, nicht erst nach dem nächsten Frame)
 */
function useModalEffects(dialog: RefObject<HTMLDivElement | null>): void {
  useLayoutEffect(() => {
    document.body.classList.add("modal-open");
    dialog.current?.focus();
    return () => document.body.classList.remove("modal-open");
  }, []);
}

/**
 * Escape schließt wie bei Bootstrap unabhängig vom Fokus (z. B. direkt nach dem Öffnen, solange der
 * Fokus noch auf dem auslösenden Button liegt). Hat Inhalt das Event schon behandelt
 * (`preventDefault`), bleibt der Dialog offen.
 */
function useEscape(onClose: () => void): void {
  const latest = useRef(onClose);
  latest.current = onClose;
  useLayoutEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) latest.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}

export function Modal(props: ModalProps) {
  const dialog = useRef<HTMLDivElement>(null);
  useModalEffects(dialog);
  useEscape(props.onClose);
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
        onClick={(e) => e.target === e.currentTarget && props.onClose()}
      >
        <div
          class={`modal-dialog modal-dialog-centered${props.size ? ` modal-${props.size}` : ""}`}
          role="document"
        >
          <div class="modal-content">
            <ModalHeader {...props} />
            <div class="modal-body">{props.children}</div>
          </div>
        </div>
      </div>
      <div class="modal-backdrop fade show" />
    </>
  );
}

/** Ohne `headerActions` unverändert; mit Aktionen stehen sie und ✕ in einem Container rechts */
function ModalHeader(props: ModalProps) {
  return (
    <div class="modal-header">
      <h5 class="modal-title" id={props.titleId}>
        {props.title}
      </h5>
      {props.headerActions ? (
        <div class="ms-auto d-flex align-items-center gap-2">
          {props.headerActions}
          <CloseButton {...props} extraClass=" m-0" />
        </div>
      ) : (
        <CloseButton {...props} />
      )}
    </div>
  );
}

function CloseButton(props: ModalProps & { extraClass?: string }) {
  return (
    <button
      type="button"
      class={`btn-close${props.extraClass ?? ""}`}
      data-testid={props.closeTestId}
      aria-label={props.closeLabel}
      onClick={props.onClose}
    />
  );
}
