// Baut alles, stellt dist/package/opt zusammen und erzeugt mit nfpm (Docker) das .deb-Paket
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stage = join(root, "dist/package/opt");
// Explizite Liste: Test-Fixtures (e2e/.build) kommen nie ins Paket
const BUNDLED_ADDONS = ["addons/consumers", "addons/hello"];

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
  await mkdir(join(stage, "addons"), { recursive: true });
  await copyFile(join(root, "packages/proxy/dist/server.mjs"), join(stage, "server.mjs"));
  await copyFile(join(root, "packages/loader/dist/loader.js"), join(stage, "public/loader.js"));
  for (const dir of BUNDLED_ADDONS) {
    const { id, version } = await readJson(`${dir}/addon.json`);
    const zip = `${id}-${version}.zip`;
    await copyFile(join(root, "dist/addons", zip), join(stage, "addons", zip));
  }
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
  process.stdout.write(`${join(root, "dist", `evcc-addons_${version}_all.deb`)}\n`);
} catch (err) {
  process.stderr.write(`Paketbau fehlgeschlagen: ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
}
