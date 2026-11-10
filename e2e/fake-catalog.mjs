// Fake-Katalog für die E2E-Tests auf 127.0.0.1:17095, wie die GitHub-Contents-API und releases/latest.
// Startet vor seed.mjs (extra-Webserver), daher werden die Dateien aus e2e/.build/catalog bei jeder Anfrage gelesen.
import { readFile } from "node:fs/promises";
import http from "node:http";
import { basename, resolve } from "node:path";

const PORT = 17095;
const dir = resolve(import.meta.dirname, ".build/catalog");
/** Feste Pfade; fehlt release.json, antwortet /releases/latest mit 404 */
const FIXED_FILES = { "/contents/addons": "listing.json", "/releases/latest": "release.json" };

async function respond(res, path) {
  if (path === "/health") return void res.writeHead(200).end("ok");
  const file = FIXED_FILES[path] ?? fileName(path);
  if (!file) return void res.writeHead(404).end("not found");
  try {
    const data = await readFile(resolve(dir, file));
    res.writeHead(200, { "content-length": data.length }).end(data);
  } catch (err) {
    const status = err.code === "ENOENT" ? 404 : 500;
    res.writeHead(status).end(`${file}: ${err.message}`);
  }
}

/** /files/<name> ohne Unterverzeichnisse */
function fileName(path) {
  if (!path.startsWith("/files/")) return null;
  const name = decodeURIComponent(path.slice("/files/".length));
  return name !== "" && basename(name) === name ? name : null;
}

const server = http.createServer((req, res) => {
  const path = new URL(req.url ?? "/", "http://fake").pathname;
  respond(res, path).catch((err) => {
    process.stderr.write(`fake-catalog: ${err instanceof Error ? err.message : err}\n`);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
});

server.on("error", (err) => {
  process.stderr.write(`fake-catalog nicht gestartet: ${err.message}\n`);
  process.exit(1);
});
server.listen(PORT, "127.0.0.1");
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    server.closeAllConnections();
  });
}
