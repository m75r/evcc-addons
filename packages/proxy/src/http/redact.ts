// Schwärzung von Pfaden für Logs: Sub-Pfade der Server-Addons können Tokens enthalten

/** /addons-api/ext/<id>/… → /addons-api/ext/<id>/*** (das Format der Sub-Pfade kennt nur das Addon) */
const EXT_SUB_PATH = /^(\/addons-api\/ext\/[^/?#]+)[/?].*$/s;

export function redactPath(url: string | undefined): string | undefined {
  return url?.replace(EXT_SUB_PATH, "$1/***");
}
