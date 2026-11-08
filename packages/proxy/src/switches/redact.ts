// Schwärzt den Token der Gateway-URLs (/addons-api/switches/<id>/<token>/…) für Logs

const TOKEN_SEGMENT = /^(\/addons-api\/switches\/[^/?#]+\/)[^/?#]+(?=\/)/;

export function redactPath(url: string | undefined): string | undefined {
  return url?.replace(TOKEN_SEGMENT, "$1***");
}
