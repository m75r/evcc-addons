// Neuestes Release der Plattform (GitHub releases/latest): Version, Versionshinweise und .deb mit sha256
import { AddonError } from "../addons/errors.js";
import { VERSION_PATTERN } from "../addons/manifest.js";
import { fetchText } from "../catalog/http.js";
import { errorMessage, isRecord } from "../util.js";

export interface LatestRelease {
  /** tag_name ohne führendes "v", erfüllt VERSION_PATTERN */
  version: string;
  /** published_at */
  publishedAt: string;
  /** html_url */
  notesUrl: string;
  /** Asset evcc-addons_<version>_all.deb mit digest, sonst null */
  deb: { url: string; sha256: string } | null;
}

const PACKAGE_NAME = "evcc-addons";
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 1024 * 1024;
const DIGEST_PATTERN = /^sha256:([0-9a-f]{64})$/;

/** Debian-Schreibweise wie nfpm (erstes "-" → "~"), z. B. für den manuellen Befehl */
export function debAssetName(version: string): string {
  return `${PACKAGE_NAME}_${version.replace("-", "~")}_all.deb`;
}

/** Beide Schreibweisen: evcc-addons_2.2.0-rc.1_all.deb und evcc-addons_2.2.0~rc.1_all.deb */
export function isDebAsset(name: string, version: string): boolean {
  return name === `${PACKAGE_NAME}_${version}_all.deb` || name === debAssetName(version);
}

export async function fetchLatestRelease(
  url: string,
  fetchImpl?: typeof fetch,
): Promise<LatestRelease> {
  const text = await fetchText(url, {
    code: "release-unavailable",
    sizeCode: "release-invalid",
    timeoutMs: TIMEOUT_MS,
    maxBytes: MAX_BYTES,
    headers: { accept: "application/vnd.github+json" },
    fetch: fetchImpl,
  });
  return parseRelease(text, url);
}

/** Prüft die Antwort von releases/latest; Fehler ergeben `AddonError("release-invalid")` */
export function parseRelease(text: string, releaseUrl: string): LatestRelease {
  const raw = parseJson(text);
  const allowHttp = new URL(releaseUrl).protocol === "http:";
  const version = parseVersion(raw.tag_name);
  return {
    version,
    publishedAt: requireString(raw.published_at, "published_at"),
    notesUrl: requireUrl(raw.html_url, "html_url", allowHttp),
    deb: findDeb(raw.assets, version, allowHttp),
  };
}

function invalid(message: string): AddonError {
  return new AddonError("release-invalid", message);
}

function parseJson(text: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw invalid(`kein JSON (${errorMessage(err)})`);
  }
  if (!isRecord(parsed)) throw invalid("kein JSON-Objekt");
  return parsed;
}

function parseVersion(tag: unknown): string {
  const version = requireString(tag, "tag_name").replace(/^v/, "");
  if (!VERSION_PATTERN.test(version)) {
    throw invalid(`tag_name ${JSON.stringify(tag)} ist keine Version x.y.z[-pre]`);
  }
  return version;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value === "") throw invalid(`${field} fehlt`);
  return value;
}

/** https; http nur, wenn die releaseUrl selbst http ist (Test-Fake) */
function requireUrl(value: unknown, field: string, allowHttp: boolean): string {
  const text = requireString(value, field);
  let protocol: string;
  try {
    protocol = new URL(text).protocol;
  } catch {
    throw invalid(`${field} ist keine URL`);
  }
  if (protocol === "https:" || (allowHttp && protocol === "http:")) return text;
  throw invalid(`${field} ist keine https-URL`);
}

/** null ohne passendes Asset oder ohne digest (ältere Assets haben keinen) */
function findDeb(assets: unknown, version: string, allowHttp: boolean): LatestRelease["deb"] {
  const asset = assetList(assets).find(
    (item) => typeof item.name === "string" && isDebAsset(item.name, version),
  );
  if (!asset || asset.digest === undefined || asset.digest === null) return null;
  const match = typeof asset.digest === "string" ? DIGEST_PATTERN.exec(asset.digest) : null;
  if (!match) throw invalid(`digest von ${String(asset.name)} ist nicht sha256:<64 hex>`);
  const url = requireUrl(asset.browser_download_url, "browser_download_url", allowHttp);
  return { url, sha256: match[1] };
}

function assetList(assets: unknown): Record<string, unknown>[] {
  if (assets === undefined) return [];
  if (!Array.isArray(assets)) throw invalid("assets ist keine Liste");
  return assets.filter(isRecord);
}
