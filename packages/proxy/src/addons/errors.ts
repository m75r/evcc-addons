// Fehler rund um Addons mit stabilem Code für API und Oberfläche

export type AddonErrorCode =
  | "zip-slip"
  | "zip-invalid"
  | "too-large"
  | "too-many-files"
  | "manifest-missing"
  | "manifest-invalid"
  | "entry-missing"
  | "id-invalid"
  | "version-invalid"
  | "api-version-unsupported"
  | "not-found"
  | "body-invalid"
  | "settings-invalid"
  | "unsupported-media-type"
  | "login-required"
  | "admin-password-missing"
  | "demo-mode"
  | "evcc-unreachable"
  | "origin-mismatch"
  | "catalog-unavailable"
  | "catalog-invalid"
  | "download-failed"
  | "checksum-mismatch"
  | "catalog-mismatch"
  | "catalog-incompatible"
  | "downgrade";

const STATUS: Partial<Record<AddonErrorCode, number>> = {
  "not-found": 404,
  "catalog-incompatible": 409,
  downgrade: 409,
  "too-large": 413,
  "unsupported-media-type": 415,
  "login-required": 401,
  "admin-password-missing": 403,
  "demo-mode": 403,
  "origin-mismatch": 403,
  "evcc-unreachable": 502,
  "catalog-unavailable": 502,
  "download-failed": 502,
  "checksum-mismatch": 502,
  "catalog-mismatch": 502,
};

export class AddonError extends Error {
  override name = "AddonError";

  constructor(
    readonly code: AddonErrorCode,
    message: string,
    readonly details: Record<string, string> = {},
  ) {
    super(message);
  }

  /** HTTP-Status: Validierungsfehler ergeben 400 */
  get status(): number {
    return STATUS[this.code] ?? 400;
  }
}
