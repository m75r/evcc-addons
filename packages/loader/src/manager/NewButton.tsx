// Button im Stil von evcc Config/NewDeviceButton (nur Text, grauer Rahmen)

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
      {label}
    </button>
  );
}
