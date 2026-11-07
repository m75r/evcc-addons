// SVG-Icons des Addons (Markup für addTab und Kartenköpfe)
import { DEVICE_ICONS } from "./device-icons.js";

/** Steckdose */
export const SOCKET_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="12" cy="12" r="5"/><path d="M10 11v2M14 11v2"/></svg>';

/** Power-Symbol ⏻ (eigenes SVG) für den Button „An/Aus (Schnell)“ */
export const POWER_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 3v9"/><path d="M6.34 7.34a8 8 0 1 0 11.32 0"/></svg>';

/**
 * Sonne für den Button „Smart“.
 * Quelle: @h2d2/shopicons 1.9.1, es/regular/sun.js (Apache-2.0, https://github.com/h2d2/shopicons)
 */
export const SUN_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="20" height="20" fill="currentColor" aria-hidden="true"><path fill="none" d="M0 0h48v48H0z"/><path d="M24 34c5.514 0 10-4.486 10-10s-4.486-10-10-10-10 4.486-10 10 4.486 10 10 10m6-10c0 3.309-2.691 6-6 6s-6-2.691-6-6 2.691-6 6-6 6 2.691 6 6M22 4h4v6h-4zM22 38h4v6h-4zM4 22h6v4H4zM38 22h6v4h-6zM12.268 7.68l3.464-2 3 5.196-3.464 2zM29.267 37.122l3.465-2 3 5.196-3.465 2zM5.68 32.267l5.195-3 2 3.465-5.195 3zM35.125 15.269l5.196-3 2 3.466-5.196 3zM5.68 15.732l2-3.465 5.196 3-2 3.465zM35.124 32.734l2-3.465 5.196 3-2 3.465zM12.267 40.32l3-5.197 3.464 2-3 5.196zM29.269 10.875l3-5.195 3.465 2-3 5.196z"/></svg>';

/** Geräte-Icon von evcc nach Name; unbekannte Namen (z. B. `car`) erhalten das Standard-Icon */
export function deviceIcon(name: string): string {
  return DEVICE_ICONS[name] ?? DEVICE_ICONS.generic;
}
