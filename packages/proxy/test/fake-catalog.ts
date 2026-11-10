// In-Memory-Katalog wie die GitHub-Contents-API: Listing unter /contents/addons, Dateien unter /files/<name>
import http, { type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export interface FakeCatalog {
  /** Basis-URL, z. B. http://127.0.0.1:1234 */
  url: string;
  listingUrl: string;
  /** URL einer Datei, z. B. für `url` in einer YAML */
  fileUrl(name: string): string;
  /** Setzt oder ersetzt eine Datei */
  set(name: string, content: string | Uint8Array): void;
  /** Anzahl Anfragen auf einen Pfad (ohne Query), z. B. `/contents/addons` */
  hits(path: string): number;
  setStatus(path: string, status: number, headers?: Record<string, string>): void;
  setDelay(path: string, ms: number): void;
  close(): Promise<void>;
}

export const LISTING_PATH = "/contents/addons";

interface FakeState {
  files: Map<string, string | Uint8Array>;
  hits: Map<string, number>;
  statuses: Map<string, { status: number; headers: Record<string, string> }>;
  delays: Map<string, number>;
  base: string;
}

export async function startFakeCatalog(
  files: Record<string, string | Uint8Array> = {},
): Promise<FakeCatalog> {
  const state: FakeState = {
    files: new Map(Object.entries(files)),
    hits: new Map(),
    statuses: new Map(),
    delays: new Map(),
    base: "",
  };
  const server = http.createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://fake").pathname;
    state.hits.set(path, (state.hits.get(path) ?? 0) + 1);
    setTimeout(() => respond(res, path, state), state.delays.get(path) ?? 0);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  state.base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return fakeApi(server, state);
}

function fakeApi(server: http.Server, state: FakeState): FakeCatalog {
  return {
    url: state.base,
    listingUrl: `${state.base}${LISTING_PATH}?ref=main`,
    fileUrl: (name) => `${state.base}/files/${name}`,
    set: (name, content) => void state.files.set(name, content),
    hits: (path) => state.hits.get(path) ?? 0,
    setStatus: (path, status, headers = {}) => void state.statuses.set(path, { status, headers }),
    setDelay: (path, ms) => void state.delays.set(path, ms),
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
        server.closeAllConnections();
      }),
  };
}

function respond(res: ServerResponse, path: string, state: FakeState): void {
  if (res.destroyed) return;
  const override = state.statuses.get(path);
  if (override) return void res.writeHead(override.status, override.headers).end("{}");
  if (path === LISTING_PATH) {
    return sendBody(res, JSON.stringify(listing(state)), "application/json");
  }
  const content = path.startsWith("/files/") ? state.files.get(path.slice(7)) : undefined;
  if (content === undefined) return void res.writeHead(404).end("not found");
  sendBody(res, content, "application/octet-stream");
}

function listing(state: FakeState) {
  return [...state.files.keys()].map((name) => ({
    name,
    type: "file",
    download_url: `${state.base}/files/${name}`,
  }));
}

function sendBody(res: ServerResponse, body: string | Uint8Array, type: string): void {
  const data = typeof body === "string" ? Buffer.from(body) : body;
  res.writeHead(200, { "content-type": type, "content-length": data.length }).end(data);
}
