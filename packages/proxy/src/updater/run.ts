// Ablauf des Root-Updaters: Anforderung lesen, Release prüfen, .deb laden und prüfen, mit apt installieren.
// Der Proxy übergibt nur eine Version; URL und Prüfsumme holt der Updater selbst bei GitHub.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AddonError } from "../addons/errors.js";
import { VERSION_PATTERN } from "../addons/manifest.js";
import { compareVersions } from "../addons/version.js";
import { fetchBytes } from "../catalog/http.js";
import { verifySha256 } from "../catalog/install.js";
import type { ProxyConfig } from "../config.js";
import type { Logger } from "../logger.js";
import { debAssetName, fetchLatestRelease } from "../platform/release.js";
import {
  UPDATE_REQUEST_FILE,
  writeUpdateStatus,
  type UpdateRequest,
  type UpdateState,
} from "../platform/update-status.js";
import { errorMessage } from "../util.js";
import { PACKAGE_NAME, debianToSemver, type DpkgTools } from "./dpkg.js";
import { takeRequest, type TakenRequest } from "./request.js";

export interface UpdaterDeps {
  config: ProxyConfig;
  /** Verzeichnis der status.json (StateDirectory) */
  statusDir: string;
  logger: Logger;
  dpkg: DpkgTools;
  fetch?: typeof fetch;
  /** Hier entsteht ein Temp-Verzeichnis für das .deb */
  tmpDir: string;
  /** Standard 50 MiB */
  maxBytes?: number;
  /** Standard 120 s */
  downloadTimeoutMs?: number;
}

interface Run {
  deps: UpdaterDeps;
  request: UpdateRequest;
  setStatus: (state: UpdateState, message?: string) => Promise<void>;
}

const MAX_BYTES = 50 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 120_000;

/** true: installiert oder nichts zu tun; false: Fehler (Exit-Code 1) */
export async function runUpdate(deps: UpdaterDeps): Promise<boolean> {
  const taken = await readRequest(deps);
  if (taken === null) {
    deps.logger.info("update skipped", { reason: "no request" });
    return true;
  }
  if ("invalid" in taken) {
    deps.logger.error("update failed", { error: taken.invalid });
    return false;
  }
  return performUpdate(createRun(deps, taken.request));
}

async function readRequest(deps: UpdaterDeps): Promise<TakenRequest> {
  try {
    return await takeRequest(join(deps.config.dataDir, UPDATE_REQUEST_FILE));
  } catch (err) {
    return { invalid: errorMessage(err) };
  }
}

function createRun(deps: UpdaterDeps, request: UpdateRequest): Run {
  const setStatus = (state: UpdateState, message?: string) =>
    writeUpdateStatus(deps.statusDir, {
      id: request.id,
      state,
      version: request.version,
      ...(message === undefined ? {} : { message }),
      at: new Date().toISOString(),
    });
  return { deps, request, setStatus };
}

async function performUpdate(run: Run): Promise<boolean> {
  const { request, deps } = run;
  try {
    await run.setStatus("downloading");
    await installRelease(run);
    await run.setStatus("done");
    deps.logger.info("update installed", { version: request.version });
    return true;
  } catch (err) {
    const message = errorMessage(err);
    deps.logger.error("update failed", {
      id: request.id,
      version: request.version,
      error: message,
    });
    await reportFailure(run, message);
    return false;
  }
}

/** Ein Fehler beim Schreiben des Status wird geloggt; der Lauf ist ohnehin fehlgeschlagen */
async function reportFailure(run: Run, message: string): Promise<void> {
  try {
    await run.setStatus("failed", message);
  } catch (err) {
    run.deps.logger.error("update status not written", { error: errorMessage(err) });
  }
}

async function installRelease(run: Run): Promise<void> {
  const deb = await checkRelease(run);
  const bytes = await download(run, deb);
  const dir = await mkdtemp(join(run.deps.tmpDir, "evcc-addons-update-"));
  try {
    const file = join(dir, `${PACKAGE_NAME}.deb`);
    await writeFile(file, bytes, { flag: "wx", mode: 0o644 });
    await checkPackage(run, file);
    await run.setStatus("installing");
    await run.deps.dpkg.aptInstall(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Version von releases/latest, Paket mit Prüfsumme und neuer als das installierte Paket */
async function checkRelease(run: Run): Promise<{ url: string; sha256: string }> {
  const { deps, request } = run;
  const release = await fetchLatestRelease(deps.config.releaseUrl, deps.fetch);
  if (release.version !== request.version) {
    throw new Error(`Angefordert ist ${request.version}, GitHub bietet ${release.version} an`);
  }
  if (release.deb === null) throw new Error("Das Release enthält kein Paket mit Prüfsumme");
  const installed = debianToSemver(await deps.dpkg.installedVersion());
  deps.logger.info("update started", { id: request.id, version: request.version, installed });
  if (!VERSION_PATTERN.test(installed) || compareVersions(request.version, installed) <= 0) {
    throw new Error(`Installiert ist ${installed}, kein Update auf ${request.version}`);
  }
  return release.deb;
}

async function download(run: Run, deb: { url: string; sha256: string }): Promise<Uint8Array> {
  const { deps, request } = run;
  const name = debAssetName(request.version);
  let bytes: Uint8Array;
  try {
    bytes = await fetchBytes(deb.url, {
      code: "download-failed",
      maxBytes: deps.maxBytes ?? MAX_BYTES,
      timeoutMs: deps.downloadTimeoutMs ?? DOWNLOAD_TIMEOUT_MS,
      fetch: deps.fetch,
    });
  } catch (err) {
    if (!(err instanceof AddonError)) throw err;
    throw new Error(`Download von ${name} fehlgeschlagen: ${err.message}`, { cause: err });
  }
  verifySha256(bytes, deb.sha256, name);
  deps.logger.info("update downloaded", { version: request.version, bytes: bytes.length });
  return bytes;
}

/** Paketname und Version im .deb; apt darf außer evcc-addons nichts ändern */
async function checkPackage(run: Run, file: string): Promise<void> {
  const { deps, request } = run;
  const fields = await deps.dpkg.debFields(file);
  if (fields.package !== PACKAGE_NAME || debianToSemver(fields.version) !== request.version) {
    const found = `${fields.package} ${fields.version}`;
    throw new Error(`Paket enthält ${found}, erwartet ${PACKAGE_NAME} ${request.version}`);
  }
  const others = (await deps.dpkg.simulateInstall(file)).filter((name) => name !== PACKAGE_NAME);
  if (others.length > 0) {
    throw new Error(`Das Update würde weitere Pakete ändern: ${others.join(", ")}`);
  }
}
