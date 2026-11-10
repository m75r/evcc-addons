// Laden und Prüfen der Proxy-Konfiguration (config.json)
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { errorMessage, isRecord } from "./util.js";

export type LogLevel = "info" | "debug";

export interface ProxyConfig {
  listen: { host: string; port: number };
  evccUrl: string;
  dataDir: string;
  publicDir: string;
  maxUploadBytes: number;
  logLevel: LogLevel;
  /** Listing des Katalogs (GitHub-Contents-API auf das Verzeichnis addons/) */
  catalogUrl: string;
  /** Release-API der Plattform (GitHub releases/latest) */
  releaseUrl: string;
}

export class ConfigError extends Error {
  override name = "ConfigError";
}

/** Standard-publicDir: Ordner `public` neben dem gebauten server.mjs */
export function defaultPublicDir(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "public");
}

export const DEFAULT_CONFIG: Omit<ProxyConfig, "publicDir"> = {
  listen: { host: "0.0.0.0", port: 80 },
  evccUrl: "http://127.0.0.1:7070",
  dataDir: "/var/lib/evcc-addons",
  maxUploadBytes: 10 * 1024 * 1024,
  logLevel: "info",
  catalogUrl: "https://api.github.com/repos/m75r/evcc-addons/contents/addons?ref=main",
  releaseUrl: "https://api.github.com/repos/m75r/evcc-addons/releases/latest",
};

/** Liest die Konfigurationsdatei, ergänzt Defaults und prüft alle Werte */
export async function loadConfig(path: string): Promise<ProxyConfig> {
  const raw = await readConfigFile(path);
  return buildConfig(raw, dirname(resolve(path)));
}

async function readConfigFile(path: string): Promise<Record<string, unknown>> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    throw new ConfigError(`Konfigurationsdatei ${path} nicht lesbar: ${errorMessage(err)}`, {
      cause: err,
    });
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) throw new Error("kein JSON-Objekt");
    return parsed;
  } catch (err) {
    throw new ConfigError(`Konfigurationsdatei ${path} ungültig: ${errorMessage(err)}`, {
      cause: err,
    });
  }
}

/** Ergänzt Defaults und löst relative Pfade gegen `baseDir` auf (exportiert für Tests) */
export function buildConfig(raw: Record<string, unknown>, baseDir: string): ProxyConfig {
  const listen = isRecord(raw.listen) ? raw.listen : {};
  const config: ProxyConfig = {
    listen: {
      host: stringField("listen.host", listen.host, DEFAULT_CONFIG.listen.host),
      port: portField(listen.port ?? DEFAULT_CONFIG.listen.port),
    },
    evccUrl: urlField("evccUrl", raw.evccUrl ?? DEFAULT_CONFIG.evccUrl),
    dataDir: resolve(baseDir, stringField("dataDir", raw.dataDir, DEFAULT_CONFIG.dataDir)),
    publicDir: resolve(baseDir, stringField("publicDir", raw.publicDir, defaultPublicDir())),
    maxUploadBytes: positiveInt(
      "maxUploadBytes",
      raw.maxUploadBytes ?? DEFAULT_CONFIG.maxUploadBytes,
    ),
    logLevel: logLevelField(raw.logLevel ?? DEFAULT_CONFIG.logLevel),
    catalogUrl: urlField("catalogUrl", raw.catalogUrl ?? DEFAULT_CONFIG.catalogUrl),
    releaseUrl: urlField("releaseUrl", raw.releaseUrl ?? DEFAULT_CONFIG.releaseUrl),
  };
  return config;
}

function stringField(field: string, value: unknown, fallback: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || value.trim() === "") {
    throw new ConfigError(`Ungültiger Wert für ${field}: ${JSON.stringify(value)}`);
  }
  return value;
}

function portField(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 65535) {
    throw new ConfigError(
      `Ungültiger Wert für listen.port: ${JSON.stringify(value)} (erlaubt: 1–65535)`,
    );
  }
  return value;
}

function urlField(field: string, value: unknown): string {
  const text = typeof value === "string" ? value : "";
  let url: URL | undefined;
  try {
    url = new URL(text);
  } catch {
    url = undefined;
  }
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) {
    throw new ConfigError(
      `Ungültiger Wert für ${field}: ${JSON.stringify(value)} (erwartet: http-URL)`,
    );
  }
  return text.replace(/\/+$/, "");
}

function positiveInt(field: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new ConfigError(`Ungültiger Wert für ${field}: ${JSON.stringify(value)}`);
  }
  return value;
}

function logLevelField(value: unknown): LogLevel {
  if (value !== "info" && value !== "debug") {
    throw new ConfigError(`Ungültiger Wert für logLevel: ${JSON.stringify(value)} (info|debug)`);
  }
  return value;
}
