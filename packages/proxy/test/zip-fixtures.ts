// Erzeugt Addon-ZIPs für Tests
import { strToU8, zipSync, type Zippable } from "fflate";

export const LIMITS = { maxBytes: 10 * 1024 * 1024, maxFiles: 500 };

export function manifest(overrides: Record<string, unknown> = {}) {
  return {
    id: "hello",
    name: { de: "Hallo Welt", en: "Hello World" },
    version: "0.1.0",
    apiVersion: 1,
    entry: "index.js",
    ...overrides,
  };
}

export function addonZip(
  overrides: Record<string, unknown> = {},
  extra: Record<string, Uint8Array> = {},
): Uint8Array {
  const files: Zippable = {
    "addon.json": strToU8(JSON.stringify(manifest(overrides))),
    "index.js": strToU8("export function activate() {}"),
    ...extra,
  };
  return zipSync(files);
}

export function rawZip(files: Record<string, Uint8Array>): Uint8Array {
  return zipSync(files);
}
