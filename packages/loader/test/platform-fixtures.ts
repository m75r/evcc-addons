// Antworten von GET /addons-api/platform für Loader-Tests
import type { PlatformInfo } from "../src/addons-client.js";

/** Laufend 2.1.0, verfügbar 2.2.0 (manueller Weg, canInstall false) */
export function platformInfo(overrides: Partial<PlatformInfo> = {}): PlatformInfo {
  return {
    current: "2.1.0",
    latest: {
      version: "2.2.0",
      publishedAt: "2026-11-12T10:00:00Z",
      notesUrl: "https://github.com/m75r/evcc-addons/releases/tag/v2.2.0",
      downloadUrl:
        "https://github.com/m75r/evcc-addons/releases/download/v2.2.0/evcc-addons_2.2.0_all.deb",
    },
    updateAvailable: true,
    canInstall: false,
    checkError: null,
    update: null,
    ...overrides,
  };
}

/** Kein Update: neuestes Release ist die laufende Version */
export const UP_TO_DATE: PlatformInfo = platformInfo({
  latest: {
    version: "2.1.0",
    publishedAt: "2026-11-01T10:00:00Z",
    notesUrl: "https://github.com/m75r/evcc-addons/releases/tag/v2.1.0",
    downloadUrl: null,
  },
  updateAvailable: false,
});
