// Fake für GitHub releases/latest im Test-Container: node fake-release.mjs <port> <release.json> <paketverzeichnis>
// /releases/latest liefert die JSON-Datei (bei jeder Anfrage neu gelesen), /download/<name> eine Datei des Verzeichnisses
import { readFile } from "node:fs/promises";
import http from "node:http";
import { basename, join } from "node:path";

const [port, releaseFile, pkgDir] = process.argv.slice(2);

function fileFor(path) {
  if (path === "/releases/latest") return releaseFile;
  if (!path.startsWith("/download/")) return null;
  const name = decodeURIComponent(path.slice("/download/".length));
  return name !== "" && basename(name) === name ? join(pkgDir, name) : null;
}

async function respond(res, path) {
  if (path === "/health") return void res.writeHead(200).end("ok");
  const file = fileFor(path);
  if (!file) return void res.writeHead(404).end("not found");
  try {
    const data = await readFile(file);
    res.writeHead(200, { "content-length": data.length }).end(data);
  } catch (err) {
    res.writeHead(err.code === "ENOENT" ? 404 : 500).end(err.message);
  }
}

const server = http.createServer((req, res) => {
  const path = new URL(req.url ?? "/", "http://fake").pathname;
  respond(res, path).catch((err) => {
    process.stderr.write(`fake-release: ${err instanceof Error ? err.message : err}\n`);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
});

server.on("error", (err) => {
  process.stderr.write(`fake-release nicht gestartet: ${err.message}\n`);
  process.exit(1);
});
server.listen(Number(port), "127.0.0.1");
