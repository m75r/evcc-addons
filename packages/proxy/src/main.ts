// CLI-Einstieg: startet den Proxy (Standard) oder installiert Addons (`install`)
import { loadConfig } from "./config.js";
import { runInstall } from "./install-command.js";
import { createLogger, type Logger } from "./logger.js";
import { createProxyServer, type ProxyServer } from "./server.js";
import { errorMessage } from "./util.js";
import { VERSION } from "./version.js";

const DEFAULT_CONFIG_PATH = "/etc/evcc-addons/config.json";
const SHUTDOWN_TIMEOUT_MS = 5000;

export interface CliArgs {
  command: "serve" | "install";
  configPath: string;
  reset: boolean;
  files: string[];
}

export function parseArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): CliArgs {
  const args: CliArgs = {
    command: "serve",
    configPath: env.EVCC_ADDONS_CONFIG ?? DEFAULT_CONFIG_PATH,
    reset: false,
    files: [],
  };
  const rest = [...argv];
  if (rest[0] === "install") args.command = rest.shift() as "install";
  while (rest.length > 0) {
    const arg = rest.shift() as string;
    if (arg === "--config") args.configPath = requireValue(arg, rest.shift());
    else if (arg === "--reset" && args.command === "install") args.reset = true;
    else if (args.command === "install" && !arg.startsWith("--")) args.files.push(arg);
    else throw new Error(`Unbekanntes Argument: ${arg}`);
  }
  return args;
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value) throw new Error(`${flag} erwartet einen Wert`);
  return value;
}

async function serve(args: CliArgs): Promise<void> {
  const config = await loadConfig(args.configPath);
  const logger = createLogger(config.logLevel);
  const proxy = createProxyServer(config, { logger });
  try {
    const address = await proxy.listen();
    logger.info("proxy started", {
      version: VERSION,
      listen: `${address.address}:${address.port}`,
      evcc: config.evccUrl,
    });
  } catch (err) {
    throw new Error(listenErrorMessage(err, config.listen.port), { cause: err });
  }
  registerShutdown(proxy, logger);
}

function listenErrorMessage(err: unknown, port: number): string {
  if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
    return `Port ${port} ist belegt, bitte listen.port in der Konfiguration ändern`;
  }
  return `Proxy konnte nicht starten: ${errorMessage(err)}`;
}

function registerShutdown(proxy: ProxyServer, logger: Logger): void {
  const shutdown = (signal: string) => {
    logger.info("proxy stopping", { signal });
    setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
    proxy.stop().then(
      () => process.exit(0),
      (err: unknown) => {
        logger.error("shutdown failed", { error: errorMessage(err) });
        process.exit(1);
      },
    );
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

export async function main(argv: string[]): Promise<void> {
  const logger = createLogger("info");
  try {
    const args = parseArgs(argv);
    if (args.command === "install") {
      const config = await loadConfig(args.configPath);
      await runInstall(config, args, { logger });
    } else await serve(args);
  } catch (err) {
    logger.error(argv[0] === "install" ? "install failed" : "startup failed", {
      error: errorMessage(err),
    });
    process.exitCode = 1;
  }
}
