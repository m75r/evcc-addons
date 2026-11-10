// Baut alles, stellt dist/package/opt zusammen, erzeugt mit nfpm (Docker) das .deb-Paket und packt das SDK
// (dist/evcc-addons-sdk-<version>.tgz). Addons gehören nicht ins Paket, sie haben eigene Releases.
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stage = join(root, "dist/package/opt");

async function readJson(path) {
  return JSON.parse(await readFile(join(root, path), "utf8"));
}

function run(command, args) {
  try {
    execFileSync(command, args, { cwd: root, stdio: "inherit" });
  } catch (err) {
    const reason = err.code === "ENOENT" ? `${command} nicht gefunden` : err.message;
    throw new Error(`${command} ${args[0]} fehlgeschlagen: ${reason}`, { cause: err });
  }
}

async function stageFiles() {
  await rm(join(root, "dist/package"), { recursive: true, force: true });
  await mkdir(join(stage, "public"), { recursive: true });
  await copyFile(join(root, "packages/proxy/dist/server.mjs"), join(stage, "server.mjs"));
  await copyFile(join(root, "packages/proxy/dist/updater.mjs"), join(stage, "updater.mjs"));
  await copyFile(join(root, "packages/loader/dist/loader.js"), join(stage, "public/loader.js"));
}

/** SDK-Tarball mit Typen, CLI, Test-Helfern und runtime/ dieser Version (prepack kopiert runtime/) */
function packSdk() {
  run("npm", ["pack", "-w", "@evcc-addons/sdk", "--pack-destination", "dist/"]);
}

function buildDeb(version) {
  const uid = process.getuid?.() ?? 0;
  const gid = process.getgid?.() ?? 0;
  run("docker", [
    "run",
    "--rm",
    "--user",
    `${uid}:${gid}`,
    "-e",
    `VERSION=${version}`,
    "-v",
    `${root}:/work`,
    "-w",
    "/work",
    "goreleaser/nfpm",
    "package",
    "--config",
    "packaging/nfpm.yaml",
    "--packager",
    "deb",
    "--target",
    "dist/",
  ]);
}

try {
  const { version } = await readJson("package.json");
  run("npm", ["run", "build"]);
  await stageFiles();
  buildDeb(version);
  packSdk();
  process.stdout.write(`${join(root, "dist", `evcc-addons_${version}_all.deb`)}\n`);
  process.stdout.write(`${join(root, "dist", `evcc-addons-sdk-${version}.tgz`)}\n`);
} catch (err) {
  process.stderr.write(`Paketbau fehlgeschlagen: ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
}
