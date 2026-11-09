// Öffentliche Typen der evcc-Addon-API (apiVersion 2, Version 1 wird weiter akzeptiert)

/** Aktuelle Version der Addon-API */
export const ADDON_API_VERSION = 2;

/** Versionen, die die Plattform installiert und startet */
export const SUPPORTED_API_VERSIONS = [1, 2] as const;

/** Text, entweder fest oder je Sprache, z. B. `{ de: "Hallo", en: "Hello" }` */
export type Localized = string | Record<string, string>;

/** Eintrag in der Menüleiste oder im Menü „Mehr“ */
export interface NavItem {
  label: Localized;
  /** SVG-Markup für das Icon (nur Tabs) */
  icon?: string;
  /** Unterseite des Addons, z. B. `detail` → `#/addons/<id>/detail` */
  page?: string;
  /** Freies Ziel statt einer Addon-Seite */
  href?: string;
}

/** Kontext, den eine Seite beim Mounten erhält */
export interface PageContext {
  /** Pfad unterhalb der registrierten Seite, ohne führenden Schrägstrich */
  subPath: string;
  api: AddonApi;
}

/** Seite unter `#/addons/<id>[/<path>]` */
export interface PageDef {
  path?: string;
  title: Localized;
  /** Rendert die Seite in `el`, die optionale Rückgabe räumt beim Verlassen auf */
  mount(el: HTMLElement, ctx: PageContext): void | (() => void);
}

/** Live-Daten aus dem evcc-WebSocket */
export interface LiveState {
  /** Wert unter einem Punkt-Schlüssel, z. B. `loadpoints.0.chargePower`, ohne Schlüssel den Gesamtzustand */
  get(key?: string): unknown;
  /** Meldet Änderungen unter `keyPrefix`, gibt die Abmeldefunktion zurück */
  subscribe(keyPrefix: string, cb: (value: unknown) => void): () => void;
}

/** Wert einer Einstellung */
export type SettingValue = boolean | string;

/** Werte aller Einstellungen eines Addons, je `key` */
export type SettingValues = Record<string, SettingValue>;

/** Auswahlmöglichkeit einer Einstellung vom Typ `select` */
export interface SettingOption {
  value: string;
  label: Localized;
}

/** Ja/Nein-Einstellung, dargestellt als Schalter */
export interface BooleanSettingDef {
  key: string;
  type: "boolean";
  label: Localized;
  default: boolean;
}

/** Auswahl aus festen Werten, dargestellt als Auswahlliste */
export interface SelectSettingDef {
  key: string;
  type: "select";
  label: Localized;
  default: string;
  options: SettingOption[];
}

/** Eintrag in `addon.json` → `settings` */
export type SettingDef = BooleanSettingDef | SelectSettingDef;

/** Werte aus der Seite „Addons“; Änderungen im selben Fenster meldet onChange */
export interface AddonSettings {
  get(key: string): SettingValue | undefined;
  all(): SettingValues;
  /** Meldet gespeicherte Änderungen, gibt die Abmeldefunktion zurück */
  onChange(cb: (values: SettingValues) => void): () => void;
}

/** Eintrag eines Erweiterungspunkts: Wert und Addon, das ihn bereitstellt */
export interface ExtensionEntry<T = unknown> {
  addonId: string;
  value: T;
}

/**
 * Erweiterungspunkte zwischen Addons, z. B. `consumers.cardActions`.
 * Namenskonvention `<anbieter-id>.<punkt>`; Werte sind an DOM gebunden, nicht an Preact.
 */
export interface AddonExtensions {
  /** Stellt `value` unter `point` bereit, gibt die Abmeldefunktion zurück */
  provide(point: string, value: unknown): () => void;
  /** Alle Einträge in Reihenfolge der Registrierung (Kopie) */
  get<T = unknown>(point: string): ExtensionEntry<T>[];
  /** Meldet neue und abgemeldete Einträge, gibt die Abmeldefunktion zurück */
  onChange<T = unknown>(point: string, cb: (entries: ExtensionEntry<T>[]) => void): () => void;
}

/** Kontext eines Dialogs auf der Seite „Addons“; die Funktionen dürfen weitergereicht werden */
export interface ManagerDialogContext {
  locale: string;
  /** Ein evcc-Admin ist angemeldet */
  canManage: boolean;
  /** Rückfrage wie `window.confirm` */
  confirm: (message: string) => boolean;
  /** Bei 401: schließt den Dialog und zeigt das Anmeldefeld */
  onUnauthorized: () => void;
  close: () => void;
}

/** Dialog, den ein Icon-Button auf der Karte des Addons öffnet (links neben ⚙) */
export interface ManagerDialogDef {
  /** Beschriftung des Buttons (aria-label, title) */
  label: Localized;
  /** SVG-Markup des Buttons */
  icon: string;
  title: Localized;
  /** Rendert den Inhalt in `el`, die optionale Rückgabe räumt beim Schließen auf */
  mount(el: HTMLElement, ctx: ManagerDialogContext): void | (() => void);
}

/** API, die `activate` erhält */
export interface AddonApi {
  id: string;
  addTab(item: NavItem): void;
  addMoreMenuItem(item: NavItem): void;
  registerPage(page: PageDef): void;
  state: LiveState;
  /** Einstellungen des Addons (aus `addon.json` → `settings`) */
  settings: AddonSettings;
  /** Ruft `api/<path>` von evcc relativ zur aktuellen Seite auf */
  evccApi(path: string, init?: RequestInit): Promise<Response>;
  /** Erweiterungspunkte zwischen Addons (apiVersion 2) */
  extensions: AddonExtensions;
  /** Dialog auf der Karte des Addons in der Seite „Addons“ (apiVersion 2) */
  addManagerDialog(def: ManagerDialogDef): void;
  /** Ruft die eigenen Server-Routen unter `addons-api/ext/<id>/<path>` auf (apiVersion 2) */
  serverApi(path: string, init?: RequestInit): Promise<Response>;
  locale(): string;
  theme(): "light" | "dark";
  onEnvChange(cb: () => void): () => void;
}

/** Inhalt von `addon.json` */
export interface AddonManifest {
  id: string;
  name: Localized;
  version: string;
  description?: Localized;
  entry: string;
  apiVersion: number;
  /** Server-Teil (nur apiVersion 2), relativer Pfad auf eine .mjs-Datei, z. B. `server.mjs` */
  server?: string;
  /** Einstellungen, die ein Admin auf der Seite „Addons“ ändert */
  settings?: SettingDef[];
}

/** Signatur des Exports `activate` eines Addons */
export type ActivateFn = (api: AddonApi) => void | Promise<void>;
