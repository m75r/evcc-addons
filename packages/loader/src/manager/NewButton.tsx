// Button wie evcc Config/NewDeviceButton (Plus + Text, grauer Rahmen)
import { PLUS_ICON } from "../icons.js";

export interface NewButtonProps {
  label: string;
  testId: string;
  /** Nur für Buttons, die etwas ein- und ausblenden */
  open?: boolean;
  onClick: () => void;
}

export function NewButton({ label, testId, open, onClick }: NewButtonProps) {
  return (
    <button
      type="button"
      class={`evcc-addons-new-btn d-flex align-items-center text-nowrap${open ? " active" : ""}`}
      data-testid={testId}
      aria-expanded={open}
      onClick={onClick}
    >
      <span
        class="evcc-addons-new-icon me-1 flex-shrink-0"
        dangerouslySetInnerHTML={{ __html: PLUS_ICON }}
      />
      <span>{label}</span>
    </button>
  );
}
