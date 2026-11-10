// Einstieg updater.mjs, gestartet als root von evcc-addons-update.service (ausgelöst über die Path-Unit)
// Aufruf: node updater.mjs [--config /etc/evcc-addons/config.json]; Status unter $STATE_DIRECTORY
import { tmpdir } from "node:os";
import { parseArgs } from "node:util";
import { loadConfig } from "../config.js";
import { createLogger } from "../logger.js";
import { UPDATE_STATUS_DIR } from "../platform/update-status.js";
import { errorMessage } from "../util.js";
import { systemDpkg } from "./dpkg.js";
import { runUpdate } from "./run.js";

const DEFAULT_CONFIG = "/etc/evcc-addons/config.json";

/** Exit-Code: 0 installiert oder nichts zu tun, 1 Fehler */
async function main(argv: string[]): Promise<number> {
  const startLogger = createLogger("info");
  try {
    const { values } = parseArgs({ args: argv, options: { config: { type: "string" } } });
    const config = await loadConfig(values.config ?? DEFAULT_CONFIG);
    const ok = await runUpdate({
      config,
      statusDir: process.env.STATE_DIRECTORY ?? UPDATE_STATUS_DIR,
      tmpDir: tmpdir(),
      logger: createLogger(config.logLevel),
      dpkg: systemDpkg,
    });
    return ok ? 0 : 1;
  } catch (err) {
    startLogger.error("update failed", { error: errorMessage(err) });
    return 1;
  }
}

void main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
