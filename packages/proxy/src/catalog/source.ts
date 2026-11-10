// Katalog aus dem Verzeichnis addons/ (GitHub-Contents-API), im Speicher zwischengespeichert
import { AddonError } from "../addons/errors.js";
import type { Logger } from "../logger.js";
import { errorMessage, isRecord } from "../util.js";
import { parseCatalogFile, type CatalogEntry } from "./entry.js";
import { fetchText } from "./http.js";

export interface CatalogSourceOptions {
  /** Listing-URL, z. B. https://api.github.com/repos/<owner>/<repo>/contents/addons?ref=main */
  url: string;
  logger: Logger;
  ttlMs?: number;
  /** Uhr in ms, austauschbar für Tests */
  now?: () => number;
  fetch?: typeof fetch;
  /** Timeout für den Download der ZIPs, Standard 60 s; im Test kürzer */
  downloadTimeoutMs?: number;
}

interface ListingFile {
  name: string;
  downloadUrl: string;
}

const TIMEOUT_MS = 10_000;
const LISTING_MAX_BYTES = 1024 * 1024;
const FILE_MAX_BYTES = 64 * 1024;

export class CatalogSource {
  private cache: { entries: CatalogEntry[]; expires: number } | null = null;
  private pending: Promise<CatalogEntry[]> | null = null;
  private readonly now: () => number;
  readonly downloadTimeoutMs: number | undefined;

  constructor(private readonly opts: CatalogSourceOptions) {
    this.now = opts.now ?? Date.now;
    this.downloadTimeoutMs = opts.downloadTimeoutMs;
  }

  /** Einträge nach id sortiert; gleichzeitige Aufrufe teilen sich einen laufenden Abruf */
  entries(): Promise<CatalogEntry[]> {
    if (this.cache && this.now() < this.cache.expires) return Promise.resolve(this.cache.entries);
    this.pending ??= this.load().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  async find(id: string): Promise<CatalogEntry> {
    const entry = (await this.entries()).find((candidate) => candidate.id === id);
    if (!entry) throw new AddonError("not-found", `Addon ${id} ist nicht im Katalog`, { id });
    return entry;
  }

  private async load(): Promise<CatalogEntry[]> {
    const start = this.now();
    const files = await this.listing();
    const results = await Promise.allSettled(files.map((file) => this.loadFile(file)));
    const entries = this.collect(files, results);
    this.cache = { entries, expires: this.now() + (this.opts.ttlMs ?? 600_000) };
    this.opts.logger.debug("catalog fetched", {
      entries: entries.length,
      skipped: files.length - entries.length,
      ms: this.now() - start,
    });
    return entries;
  }

  /** Gültige Einträge nach id sortiert; übersprungene Dateien werden geloggt */
  private collect(
    files: ListingFile[],
    results: PromiseSettledResult<CatalogEntry>[],
  ): CatalogEntry[] {
    const entries: CatalogEntry[] = [];
    results.forEach((result, i) => {
      if (result.status === "fulfilled") return void entries.push(result.value);
      const error = errorMessage(result.reason);
      this.opts.logger.warn("catalog entry skipped", { file: files[i].name, error });
    });
    return entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  private async listing(): Promise<ListingFile[]> {
    try {
      const text = await fetchText(this.opts.url, {
        code: "catalog-unavailable",
        timeoutMs: TIMEOUT_MS,
        maxBytes: LISTING_MAX_BYTES,
        headers: { accept: "application/vnd.github+json" },
        fetch: this.opts.fetch,
      });
      return parseListing(text);
    } catch (err) {
      const error = errorMessage(err);
      this.opts.logger.warn("catalog unavailable", { url: this.opts.url, error });
      throw new AddonError("catalog-unavailable", `Katalog nicht abrufbar: ${error}`);
    }
  }

  private async loadFile(file: ListingFile): Promise<CatalogEntry> {
    const text = await fetchText(file.downloadUrl, {
      code: "catalog-invalid",
      timeoutMs: TIMEOUT_MS,
      maxBytes: FILE_MAX_BYTES,
      fetch: this.opts.fetch,
    });
    return parseCatalogFile(text, file.name);
  }
}

/** Antwort der Contents-API: nur Dateien `*.yaml` mit `download_url` */
function parseListing(text: string): ListingFile[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`Dateiliste ist kein JSON: ${errorMessage(err)}`, { cause: err });
  }
  if (!Array.isArray(parsed)) throw new Error("Dateiliste ist kein JSON-Array");
  return parsed.flatMap((item: unknown) => {
    if (!isRecord(item) || item.type !== "file" || typeof item.name !== "string") return [];
    if (!item.name.endsWith(".yaml") || typeof item.download_url !== "string") return [];
    return [{ name: item.name, downloadUrl: item.download_url }];
  });
}
