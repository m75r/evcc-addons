// Lizenzhinweise der ausgelieferten Bundles und Pakete (MIT, Fremdlizenzen in THIRD_PARTY_NOTICES.md)

/** Dateien im Projekt-Root, die jedem Paket und jeder Addon-ZIP beiliegen */
export const NOTICE_FILES = ["LICENSE", "THIRD_PARTY_NOTICES.md"];

/**
 * Kopfkommentar für esbuild (`banner.js`); `/*!` bleibt auch beim Minifizieren erhalten.
 * `contains` nennt die gebündelten Fremdteile, z. B. `["Preact (MIT)"]`.
 */
export function legalBanner(name, contains = []) {
  const parts = contains.length > 0 ? ` Contains ${contains.join(", ")}.` : "";
  return (
    `/*! ${name} - Copyright (c) 2026 Matthias Gasser - MIT License.${parts}` +
    " Third-party licenses: THIRD_PARTY_NOTICES.md */"
  );
}
