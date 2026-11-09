// SVG-Icons des Addons (Markup für addTab und Kartenköpfe)
import { DEVICE_ICONS } from "./device-icons.js";

/** Steckdose */
export const SOCKET_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="12" cy="12" r="5"/><path d="M10 11v2M14 11v2"/></svg>';

/** Geräte-Icon von evcc nach Name; unbekannte Namen (z. B. `car`) erhalten das Standard-Icon */
export function deviceIcon(name: string): string {
  return DEVICE_ICONS[name] ?? DEVICE_ICONS.generic;
}
