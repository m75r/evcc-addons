// Vor `npm pack`: runtime/ (server.mjs, public/loader.js derselben Plattform-Version), LICENSE und
// THIRD_PARTY_NOTICES.md ins SDK-Paket kopieren
import { copyFile, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

const sdk = resolve(import.meta.dirname, "..");
const root = resolve(sdk, "../..");
const runtime = join(sdk, "runtime");

try {
  await rm(runtime, { recursive: true, force: true });
  await mkdir(join(runtime, "public"), { recursive: true });
  await copyFile(join(root, "packages/proxy/dist/server.mjs"), join(runtime, "server.mjs"));
  await copyFile(join(root, "packages/loader/dist/loader.js"), join(runtime, "public/loader.js"));
  for (const file of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) {
    await copyFile(join(root, file), join(sdk, file));
  }
} catch (err) {
  process.stderr.write(
    `SDK-Paket nicht vorbereitet (vorher npm run build?): ${err instanceof Error ? err.message : err}\n`,
  );
  process.exit(1);
}
