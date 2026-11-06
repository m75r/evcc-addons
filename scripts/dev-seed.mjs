// Installiert das Hello-Addon einmalig in .dev/data, falls es dort noch fehlt
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
if (!existsSync(resolve(root, ".dev/data/addons/hello"))) {
  try {
    execFileSync(
      process.execPath,
      [
        resolve(root, "packages/proxy/dist/server.mjs"),
        "install",
        "--config",
        resolve(root, "dev/config.json"),
        resolve(root, "dist/addons/hello-0.1.0.zip"),
      ],
      { stdio: "inherit" },
    );
  } catch (err) {
    process.stderr.write(
      `Hello-Addon konnte nicht installiert werden: ${err instanceof Error ? err.message : err}\n`,
    );
    process.exit(1);
  }
}
