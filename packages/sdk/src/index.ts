// Öffentliche Typen der evcc-Addon-API (apiVersion 1)

/** Version der Addon-API, die dieser Loader unterstützt */
export const ADDON_API_VERSION = 1;

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
  /** Einstellungen, die ein Admin auf der Seite „Addons“ ändert */
  settings?: SettingDef[];
}

/** Signatur des Exports `activate` eines Addons */
export type ActivateFn = (api: AddonApi) => void | Promise<void>;
