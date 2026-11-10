// Installation aus dem Katalog: Download der Release-ZIP, Prüfsumme, Installation über den Store
import { createHash } from "node:crypto";
import { AddonError } from "../addons/errors.js";
import type { AddonStore, InstallResult } from "../addons/store.js";
import type { ApiContext } from "../api/context.js";
import type { CatalogEntry } from "./entry.js";
import { fetchBytes } from "./http.js";
import { catalogStatus } from "./status.js";

export const DOWNLOAD_TIMEOUT_MS = 60_000;

/** Lädt nur die URL aus dem Katalogeintrag, nie eine vom Client übergebene */
export async function installFromCatalog(ctx: ApiContext, id: string): Promise<InstallResult> {
  const entry = await ctx.catalog.find(id);
  assertInstallable(entry, await installedVersion(ctx.store, id));
  const bytes = await downloadZip(entry, ctx.config.maxUploadBytes, ctx.catalog.downloadTimeoutMs);
  verifyChecksum(entry, bytes);
  return ctx.store.install(bytes, { expect: { id: entry.id, version: entry.version } });
}

/** Wie GET /catalog: unlesbare Installationen überspringt `list()`, sie gelten als nicht installiert */
async function installedVersion(store: AddonStore, id: string): Promise<string | undefined> {
  const addon = (await store.list()).find(({ manifest }) => manifest.id === id);
  return addon?.manifest.version;
}

function assertInstallable(entry: CatalogEntry, installed: string | undefined): void {
  const status = catalogStatus(entry, installed);
  if (status === "incompatible") {
    throw new AddonError(
      "catalog-incompatible",
      `${entry.id} benötigt eine neuere Version von evcc-addons (apiVersion ${entry.apiVersion})`,
      { id: entry.id },
    );
  }
  if (status === "newer-installed") {
    throw new AddonError(
      "downgrade",
      `Installiert ist ${installed}, der Katalog bietet ${entry.version}`,
      { id: entry.id },
    );
  }
}

export async function downloadZip(
  entry: CatalogEntry,
  maxBytes: number,
  timeoutMs = DOWNLOAD_TIMEOUT_MS,
): Promise<Uint8Array> {
  try {
    return await fetchBytes(entry.url, {
      code: "download-failed",
      sizeCode: "too-large",
      maxBytes,
      timeoutMs,
    });
  } catch (err) {
    if (!(err instanceof AddonError)) throw err;
    const message = `Download von ${entry.id} ${entry.version} fehlgeschlagen: ${err.message}`;
    throw new AddonError(err.code, message, { id: entry.id, url: entry.url });
  }
}

function verifyChecksum(entry: CatalogEntry, bytes: Uint8Array): void {
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual === entry.sha256) return;
  throw new AddonError(
    "checksum-mismatch",
    `Prüfsumme von ${entry.id} ${entry.version} stimmt nicht (erwartet ${entry.sha256}, erhalten ${actual})`,
    { id: entry.id },
  );
}
