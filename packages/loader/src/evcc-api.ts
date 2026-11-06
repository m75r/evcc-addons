// Aufruf der evcc-REST-API relativ zur aktuellen Seite (wie evcc api.ts)

/** Basis wie evcc: Origin plus Pfad, damit auch Unterpfade (Ingress) funktionieren */
export function pageBase(): string {
  return window.location.origin + window.location.pathname;
}

export function evccApiUrl(path: string): string {
  return new URL("api/" + path.replace(/^\/+/, ""), pageBase()).href;
}

export function evccApi(path: string, init?: RequestInit): Promise<Response> {
  return fetch(evccApiUrl(path), init);
}
