#!/usr/bin/env node
// CLI für Addon-Repos: `evcc-addon build [dir] [--out <dir>] [--version <x.y.z>] [--legal-dir <dir>]`
// Bündelt den Browser-Teil (src/index.*) und optional den Server-Teil (src/server.* → server.mjs),
// packt beides mit addon.json, LICENSE und THIRD_PARTY_NOTICES.md als <out>/<id>-<version>.zip
import { build } from "esbuild";
import { strToU8, zipSync } from "fflate";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NOTICE_FILES, legalBanner } from "./legal.mjs";

const SOURCE_CANDIDATES = ["src/index.tsx", "src/index.ts", "src/index.js"];
const SERVER_CANDIDATES = ["src/server.ts", "src/server.js", "src/server/index.ts"];
const SERVER_FILE = "server.mjs";
const USAGE =
  "Aufruf: evcc-addon build [dir] [--out <dir>] [--version <x.y.z>] [--legal-dir <dir>]";

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (command !== "build") throw new Error(USAGE);
  const args = { dir: resolve("."), out: undefined, version: undefined, legalDir: undefined };
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--out") args.out = resolve(requireValue(rest[i], rest[++i]));
    else if (rest[i] === "--legal-dir") args.legalDir = resolve(requireValue(rest[i], rest[++i]));
    else if (rest[i] === "--version") args.version = requireValue(rest[i], rest[++i]);
    else if (rest[i].startsWith("--")) throw new Error(`Unbekannte Option ${rest[i]}. ${USAGE}`);
    else args.dir = resolve(rest[i]);
  }
  return { ...args, out: args.out ?? join(args.dir, "dist"), legalDir: args.legalDir ?? args.dir };
}

function requireValue(flag, value) {
  if (!value) throw new Error(`${flag} erwartet einen Wert. ${USAGE}`);
  return value;
}

function findSource(dir, candidates) {
  return candidates.map((file) => join(dir, file)).find((file) => existsSync(file));
}

async function bundle(dir, banner) {
  const source = findSource(dir, SOURCE_CANDIDATES);
  if (!source)
    throw new Error(`Kein Einstieg gefunden (${SOURCE_CANDIDATES.join(", ")}) in ${dir}`);
  const result = await build({
    entryPoints: [source],
    bundle: true,
    write: false,
    format: "esm",
    target: "es2020",
    jsx: "automatic",
    jsxImportSource: "preact",
    loader: { ".css": "text" },
    minify: true,
    legalComments: "eof",
    banner: { js: banner },
    logLevel: "warning",
  });
  return result.outputFiles[0].contents;
}

/** Server-Teil für Node (apiVersion 2), null ohne src/server.* */
async function bundleServer(dir, banner) {
  const source = findSource(dir, SERVER_CANDIDATES);
  if (!source) return null;
  const result = await build({
    entryPoints: [source],
    bundle: true,
    write: false,
    platform: "node",
    target: "node22",
    format: "esm",
    legalComments: "eof",
    banner: { js: banner },
    logLevel: "warning",
  });
  return result.outputFiles[0].contents;
}

/** LICENSE und THIRD_PARTY_NOTICES.md aus dem Addon-Verzeichnis; fehlen sie, bricht der Build ab */
async function noticeFiles(dir) {
  const entries = [];
  for (const name of NOTICE_FILES) {
    const path = join(dir, name);
    if (!existsSync(path)) throw new Error(`${name} fehlt in ${dir} (wird in die ZIP gepackt)`);
    entries.push([name, await readFile(path)]);
  }
  return Object.fromEntries(entries);
}

async function readManifest(dir) {
  const path = join(dir, "addon.json");
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (err) {
    throw new Error(`${path} nicht lesbar: ${err instanceof Error ? err.message : err}`, {
      cause: err,
    });
  }
}

/** `legalDir`: Herkunft von LICENSE und THIRD_PARTY_NOTICES.md, Standard das Addon-Verzeichnis */
export async function buildAddon({ dir, out, version, legalDir = dir }) {
  const manifest = await readManifest(dir);
  if (version) manifest.version = version;
  const banner = legalBanner(`evcc-addons addon ${manifest.id}`);
  const server = await bundleServer(dir, banner);
  if (server) manifest.server = SERVER_FILE;
  const zip = zipSync({
    "addon.json": strToU8(JSON.stringify(manifest, null, 2) + "\n"),
    [manifest.entry]: await bundle(dir, banner),
    ...(server ? { [SERVER_FILE]: server } : {}),
    ...(await noticeFiles(legalDir)),
  });
  await mkdir(out, { recursive: true });
  const target = join(out, `${manifest.id}-${manifest.version}.zip`);
  await writeFile(target, zip);
  return target;
}

/** Auch über den Symlink in node_modules/.bin als Hauptmodul erkannt */
function isMain() {
  return (
    Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
  );
}

if (isMain()) {
  try {
    process.stdout.write(`${await buildAddon(parseArgs(process.argv.slice(2)))}\n`);
  } catch (err) {
    process.stderr.write(
      `Addon-Build fehlgeschlagen: ${err instanceof Error ? err.message : err}\n`,
    );
    process.exit(1);
  }
}
