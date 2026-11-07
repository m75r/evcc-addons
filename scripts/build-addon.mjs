// Baut ein Addon (esbuild-Bundle des Entrys) und packt es als <out>/<id>-<version>.zip
// Aufruf: node scripts/build-addon.mjs <addonDir> [--out <dir>] [--version <x.y.z>]
import { build } from "esbuild";
import { strToU8, zipSync } from "fflate";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NOTICE_FILES, legalBanner } from "./legal.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_CANDIDATES = ["src/index.tsx", "src/index.ts", "src/index.js"];

function parseArgs(argv) {
  const args = { dir: undefined, out: join(root, "dist/addons"), version: undefined };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") args.out = resolve(argv[++i]);
    else if (argv[i] === "--version") args.version = argv[++i];
    else args.dir = resolve(argv[i]);
  }
  if (!args.dir)
    throw new Error("Aufruf: build-addon.mjs <addonDir> [--out <dir>] [--version <x.y.z>]");
  return args;
}

async function bundle(dir, banner) {
  const source = SOURCE_CANDIDATES.map((file) => join(dir, file)).find((file) => existsSync(file));
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

/** LICENSE und THIRD_PARTY_NOTICES.md aus dem Projekt-Root für die ZIP */
async function noticeFiles() {
  const entries = await Promise.all(
    NOTICE_FILES.map(async (name) => [name, await readFile(join(root, name))]),
  );
  return Object.fromEntries(entries);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(join(args.dir, "addon.json"), "utf8"));
  if (args.version) manifest.version = args.version;
  const zip = zipSync({
    "addon.json": strToU8(JSON.stringify(manifest, null, 2) + "\n"),
    [manifest.entry]: await bundle(args.dir, legalBanner(`evcc-addons addon ${manifest.id}`)),
    ...(await noticeFiles()),
  });
  await mkdir(args.out, { recursive: true });
  const target = join(args.out, `${manifest.id}-${manifest.version}.zip`);
  await writeFile(target, zip);
  process.stdout.write(`${target}\n`);
}

try {
  await main();
} catch (err) {
  process.stderr.write(`Addon-Build fehlgeschlagen: ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
}
