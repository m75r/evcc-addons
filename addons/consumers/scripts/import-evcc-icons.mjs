// Übernimmt die Geräte-Icons von evcc (assets/js/components/VehicleIcon, MIT-Lizenz) als SVG-Markup
// Aufruf im Addon-Verzeichnis: node scripts/import-evcc-icons.mjs <pfad-zum-evcc-repo>
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const target = join(root, "src/device-icons.ts");

/** Namen und Dateien aus den Importen in VehicleIcon.vue, z. B. `import bike from "./Bike.vue"` */
function iconImports(source) {
  return [...source.matchAll(/^import (\w+) from "\.\/(\w+)\.vue";$/gm)].map(([, name, file]) => ({
    name,
    file: `${file}.vue`,
  }));
}

/** SVG aus dem Template, feste Größe 24 px statt 1em */
function extractSvg(vue, file) {
  const svg = /<svg[\s\S]*?<\/svg>/.exec(vue)?.[0];
  if (!svg) throw new Error(`Kein <svg> in ${file}`);
  return svg
    .replace(/\s+/g, " ")
    .replace(/> </g, "><")
    .replace('width="1em"', 'width="24"')
    .replace('height="1em"', 'height="24"')
    .replace("<svg ", '<svg aria-hidden="true" ');
}

function commitOf(evcc) {
  try {
    return execFileSync("git", ["-C", evcc, "rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "unbekannt";
  }
}

async function main() {
  const evcc = resolve(process.argv[2] ?? "");
  const dir = join(evcc, "assets/js/components/VehicleIcon");
  const imports = iconImports(await readFile(join(dir, "VehicleIcon.vue"), "utf8"));
  if (imports.length === 0) throw new Error(`Keine Icons in ${dir} gefunden`);
  const entries = [];
  for (const { name, file } of imports) {
    entries.push(
      `  ${name}: ${JSON.stringify(extractSvg(await readFile(join(dir, file), "utf8"), file))},`,
    );
  }
  // Der /*! */-Kommentar bleibt als Lizenzhinweis im gebauten Bundle erhalten (esbuild legalComments)
  const header = [
    "// Generiert von scripts/import-evcc-icons.mjs – nicht von Hand ändern",
    `// Quelle: evcc assets/js/components/VehicleIcon (Commit ${commitOf(evcc)})`,
    "/*! Geräte-Icons aus evcc – Copyright (c) evcc.io (andig, naltatis, premultiply), MIT License, https://github.com/evcc-io/evcc */",
  ];
  const body = `export const DEVICE_ICONS: Record<string, string> = {\n${entries.join("\n")}\n};\n`;
  await writeFile(target, `${header.join("\n")}\n\n${body}`);
  process.stdout.write(`${entries.length} Icons → ${target}\n`);
}

try {
  await main();
} catch (err) {
  process.stderr.write(`Icon-Import fehlgeschlagen: ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
}
