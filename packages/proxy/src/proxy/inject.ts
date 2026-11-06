// Einschleusen des Loader-Tags in die evcc-Startseite
import type { IncomingMessage } from "node:http";

/** Nur `GET /` (Query egal) wird umgeschrieben, `HEAD` bleibt unverändert */
export function isIndexRequest(req: Pick<IncomingMessage, "method" | "url">): boolean {
  if (req.method !== "GET") return false;
  const path = (req.url ?? "/").split("?")[0];
  return path === "/";
}

export function loaderTag(version: string): string {
  const v = encodeURIComponent(version);
  return `<script type="module" src="./addons-static/_core/loader.js?v=${v}"></script>`;
}

export interface InjectResult {
  html: string;
  injected: boolean;
}

/** Fügt `tag` vor dem ersten `</head>` ein, sonst vor dem ersten `</body>` */
export function injectLoader(html: string, tag: string): InjectResult {
  for (const marker of [/<\/head\s*>/i, /<\/body\s*>/i]) {
    const match = marker.exec(html);
    if (match) {
      const html2 = html.slice(0, match.index) + tag + html.slice(match.index);
      return { html: html2, injected: true };
    }
  }
  return { html, injected: false };
}
