// Button wie evcc Config/NewDeviceButton (Plus + Text, grauer Rahmen)
// (Kopie aus packages/loader/src/manager/NewButton.tsx mit eigenem CSS-Präfix)
import { PLUS_ICON } from "../icons.js";

export interface NewButtonProps {
  label: string;
  testId: string;
  onClick: () => void;
}

export function NewButton({ label, testId, onClick }: NewButtonProps) {
  return (
    <button
      type="button"
      class="evcc-switches-tapo-new-btn d-flex align-items-center text-nowrap"
      data-testid={testId}
      onClick={onClick}
    >
      <span
        class="evcc-switches-tapo-new-icon me-1 flex-shrink-0"
        dangerouslySetInnerHTML={{ __html: PLUS_ICON }}
      />
      <span>{label}</span>
    </button>
  );
}
