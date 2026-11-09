// Modus-Buttons ⏻ (now/off) und ☀ (smart/off) für Ladepunkte (aus addons/consumers/src/model.ts)
import type { Mode } from "./contract.js";

export type ModeButton = "power" | "smart";

/** Ein aktiver Button schaltet aus, sonst auf seinen Modus */
export function nextMode(current: Mode | null, button: ModeButton): Mode {
  const target: Mode = button === "power" ? "now" : "smart";
  return current === target ? "off" : target;
}
