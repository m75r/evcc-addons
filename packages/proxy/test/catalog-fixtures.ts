// Katalogeinträge (YAML) für Tests
import { createHash } from "node:crypto";
import { stringify } from "yaml";

export function catalogFields(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "hello",
    name: { de: "Hallo Welt", en: "Hello World" },
    description: { de: "Beispiel", en: "Example" },
    homepage: "https://example.com/hello",
    version: "0.1.0",
    apiVersion: 1,
    url: "https://example.com/releases/{version}/hello-{version}.zip",
    sha256: "a".repeat(64),
    ...overrides,
  };
}

/** YAML eines Eintrags; Felder mit `undefined` fehlen */
export function catalogYaml(overrides: Record<string, unknown> = {}): string {
  return stringify(catalogFields(overrides));
}

export function sha256(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}
