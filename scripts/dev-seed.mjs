// Installiert das Fixture „menu-addon“ einmalig in .dev/data, falls es dort noch fehlt
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const out = resolve(root, ".dev/build");

function node(args) {
  execFileSync(process.execPath, args, { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
}

if (!existsSync(resolve(root, ".dev/data/addons/menu-addon"))) {
  try {
    const fixture = resolve(root, "e2e/fixtures/addons/menu-addon");
    node([
      resolve(root, "packages/sdk/bin/evcc-addon.mjs"),
      "build",
      fixture,
      "--out",
      out,
      "--legal-dir",
      root,
    ]);
    const zip = resolve(out, "menu-addon-0.1.0.zip");
    node([
      resolve(root, "packages/proxy/dist/server.mjs"),
      "install",
      "--config",
      resolve(root, "dev/config.json"),
      zip,
    ]);
  } catch (err) {
    process.stderr.write(
      `Menü-Addon konnte nicht installiert werden: ${err instanceof Error ? err.message : err}\n`,
    );
    process.exit(1);
  }
}
