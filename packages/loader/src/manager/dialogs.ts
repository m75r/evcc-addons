// Dialoge der Addons auf der Seite „Addons“ (api.addManagerDialog), je Addon-ID in Registrierungsreihenfolge
import type { ManagerDialogDef } from "@evcc-addons/sdk";

export interface ManagerDialogEntry {
  def: ManagerDialogDef;
  /** Fehlerkanal des Addons (Startfehler auf der Karte) */
  onError: (err: unknown) => void;
}

export class ManagerDialogRegistry {
  private readonly dialogs = new Map<string, ManagerDialogEntry[]>();

  add(id: string, def: ManagerDialogDef, onError: (err: unknown) => void): void {
    checkDef(def);
    const list = this.dialogs.get(id) ?? [];
    list.push({ def: { ...def }, onError });
    this.dialogs.set(id, list);
  }

  list(id: string): ManagerDialogEntry[] {
    return [...(this.dialogs.get(id) ?? [])];
  }
}

function checkDef(def: ManagerDialogDef): void {
  if (typeof def?.mount !== "function") {
    throw new Error("addManagerDialog: mount muss eine Funktion sein");
  }
  if (typeof def.icon !== "string" || def.label === undefined || def.title === undefined) {
    throw new Error("addManagerDialog: label, title und icon sind Pflicht");
  }
}
