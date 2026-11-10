// Update der Plattform: neuestes Release (im Speicher zwischengespeichert) gegenüber der laufenden Version,
// Erkennung des Root-Updaters, Anforderung einer Installation und Status des Updaters
import { randomBytes } from "node:crypto";
import { access, readFile, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AddonError } from "../addons/errors.js";
import { VERSION_PATTERN } from "../addons/manifest.js";
import { compareVersions } from "../addons/version.js";
import type { Logger } from "../logger.js";
import { errorMessage } from "../util.js";
import { fetchLatestRelease, type LatestRelease } from "./release.js";
import {
  UPDATE_REQUEST_FILE,
  UPDATE_STATUS_DIR,
  UPDATE_STATUS_FILE,
  parseUpdateStatus,
  writeAtomic,
  type UpdateStatus,
} from "./update-status.js";

export interface PlatformPaths {
  /** updater.mjs neben dem laufenden server.mjs, null außerhalb von /opt/evcc-addons */
  updaterScript: string | null;
  /** Path-Unit, die die Anforderung überwacht */
  unitFile: string;
  statusFile: string;
  /** Anforderung unter dem konfigurierten dataDir */
  requestFile: string;
  /** Datei, die die Path-Unit überwacht (Standard-dataDir des Pakets) */
  watchedRequestFile: string;
}

export interface PlatformServiceOptions {
  releaseUrl: string;
  /** Laufende Version (VERSION); "dev" im Test ohne esbuild-define */
  currentVersion: string;
  logger: Logger;
  /** Ohne Pfade gibt es keine automatische Installation */
  paths?: PlatformPaths;
  fetch?: typeof fetch;
  /** Uhr in ms, austauschbar für Tests */
  now?: () => number;
  /** Cache bei Erfolg, Standard 1 h */
  ttlMs?: number;
  /** Cache bei Fehler, Standard 5 min */
  errorTtlMs?: number;
}

export interface CheckError {
  code: string;
  message: string;
}

export interface PlatformInfo {
  current: string;
  release: LatestRelease | null;
  checkError: CheckError | null;
}

type CheckResult = Omit<PlatformInfo, "current">;

export const INSTALL_DIR = "/opt/evcc-addons";
export const PACKAGE_DATA_DIR = "/var/lib/evcc-addons";
const TTL_MS = 3_600_000;
const ERROR_TTL_MS = 300_000;
/** Eine jüngere request.json hat der Updater noch nicht abgeholt */
const REQUEST_PENDING_MS = 120_000;
/** Wie TimeoutStartSec des Updaters; ein älterer Zwischenstand gilt als abgebrochen */
const RUN_TIMEOUT_MS = 900_000;

/** `moduleDir`: Verzeichnis des laufenden Bundles (server.mjs), austauschbar für Tests */
export function defaultPlatformPaths(
  dataDir: string,
  moduleDir = dirname(fileURLToPath(import.meta.url)),
): PlatformPaths {
  return {
    updaterScript: moduleDir === INSTALL_DIR ? join(INSTALL_DIR, "updater.mjs") : null,
    unitFile: "/usr/lib/systemd/system/evcc-addons-update.path",
    statusFile: join(UPDATE_STATUS_DIR, UPDATE_STATUS_FILE),
    requestFile: join(dataDir, UPDATE_REQUEST_FILE),
    watchedRequestFile: join(PACKAGE_DATA_DIR, UPDATE_REQUEST_FILE),
  };
}

/** Neuere Version als die laufende; eine laufende Version ohne semver (dev) hat nie ein Update */
export function isUpdateAvailable(info: PlatformInfo): boolean {
  if (!info.release || !VERSION_PATTERN.test(info.current)) return false;
  return compareVersions(info.release.version, info.current) > 0;
}

/** Fehlt die Datei oder ist sie nicht zugänglich, gibt es den Updater nicht */
async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function unavailable(message: string): AddonError {
  return new AddonError("update-unavailable", message);
}

export class PlatformService {
  private cache: { result: CheckResult; expires: number } | null = null;
  private pending: Promise<CheckResult> | null = null;
  private readonly now: () => number;

  constructor(private readonly opts: PlatformServiceOptions) {
    this.now = opts.now ?? Date.now;
  }

  /** `refresh` umgeht den Cache; gleichzeitige Aufrufe teilen sich einen laufenden Abruf */
  async info(refresh = false): Promise<PlatformInfo> {
    const result = await this.check(refresh);
    return { current: this.opts.currentVersion, ...result };
  }

  /** Paket mit Updater unter /opt/evcc-addons und Standard-dataDir (nur dort wirkt die Path-Unit) */
  async canInstall(): Promise<boolean> {
    const paths = this.opts.paths;
    if (!paths?.updaterScript || paths.requestFile !== paths.watchedRequestFile) return false;
    return (await exists(paths.updaterScript)) && (await exists(paths.unitFile));
  }

  /** Status des Updaters; fehlende oder unlesbare Datei ergibt null */
  async readStatus(): Promise<UpdateStatus | null> {
    const file = this.opts.paths?.statusFile;
    if (!file) return null;
    try {
      return parseUpdateStatus(await readFile(file, "utf8"));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      this.opts.logger.warn("platform update status unreadable", {
        file,
        error: errorMessage(err),
      });
      return null;
    }
  }

  /** Legt request.json für den Updater ab und liefert die id des Laufs */
  async requestUpdate(version: string): Promise<string> {
    await this.assertInstallable(version);
    await this.assertNotRunning();
    const file = (this.opts.paths as PlatformPaths).requestFile;
    const id = randomBytes(8).toString("hex");
    await writeAtomic(dirname(file), basename(file), JSON.stringify({ id, version }) + "\n", 0o750);
    this.opts.logger.info("platform update requested", { version, id });
    return id;
  }

  private async assertInstallable(version: string): Promise<void> {
    if (!(await this.canInstall())) {
      throw unavailable("Automatische Installation ist hier nicht verfügbar");
    }
    const info = await this.info();
    const release = info.release;
    if (!release || !isUpdateAvailable(info)) throw unavailable("Kein neueres Release verfügbar");
    if (release.deb === null) throw unavailable("Das Release enthält kein Paket mit Prüfsumme");
    if (version !== release.version) {
      throw unavailable(`Verfügbar ist ${release.version}, angefordert ${version}`);
    }
  }

  /** Eine noch nicht abgeholte Anforderung oder ein laufender Updater blockieren */
  private async assertNotRunning(): Promise<void> {
    const paths = this.opts.paths as PlatformPaths;
    const pending = await this.requestAge(paths.requestFile);
    const status = await this.readStatus();
    const running =
      status !== null &&
      (status.state === "downloading" || status.state === "installing") &&
      this.now() - Date.parse(status.at) < RUN_TIMEOUT_MS;
    if ((pending !== null && pending < REQUEST_PENDING_MS) || running) {
      throw new AddonError("update-running", "Es läuft bereits eine Aktualisierung");
    }
  }

  /** Alter der request.json in ms, null ohne Datei */
  private async requestAge(file: string): Promise<number | null> {
    try {
      return this.now() - (await stat(file)).mtimeMs;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new Error(`${file} nicht lesbar: ${errorMessage(err)}`, { cause: err });
    }
  }

  private check(refresh: boolean): Promise<CheckResult> {
    const cached = this.cache;
    if (!refresh && cached && this.now() < cached.expires) return Promise.resolve(cached.result);
    this.pending ??= this.load().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  private async load(): Promise<CheckResult> {
    const start = this.now();
    try {
      const release = await fetchLatestRelease(this.opts.releaseUrl, this.opts.fetch);
      const ms = this.now() - start;
      const current = this.opts.currentVersion;
      this.opts.logger.debug("platform release checked", { current, latest: release.version, ms });
      return this.store({ release, checkError: null }, this.opts.ttlMs ?? TTL_MS);
    } catch (err) {
      const checkError = toCheckError(err);
      const fields = { url: this.opts.releaseUrl, error: checkError.message };
      this.opts.logger.warn("platform release unavailable", fields);
      return this.store({ release: null, checkError }, this.opts.errorTtlMs ?? ERROR_TTL_MS);
    }
  }

  private store(result: CheckResult, ttlMs: number): CheckResult {
    this.cache = { result, expires: this.now() + ttlMs };
    return result;
  }
}

function toCheckError(err: unknown): CheckError {
  if (err instanceof AddonError) return { code: err.code, message: err.message };
  return { code: "release-unavailable", message: errorMessage(err) };
}
