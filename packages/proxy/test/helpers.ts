// Gemeinsame Test-Helfer: Proxy mit Test-Konfiguration starten, Log-Zeilen sammeln
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildConfig, type ProxyConfig } from "../src/config.js";
import { createLogger } from "../src/logger.js";
import { createProxyServer, type ProxyDeps, type ProxyServer } from "../src/server.js";

export interface TestProxy {
  url: string;
  port: number;
  proxy: ProxyServer;
  logs: string[];
  config: ProxyConfig;
}

export async function tempDir(prefix = "evcc-addons-test-"): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

export async function startTestProxy(
  evccUrl: string,
  overrides: Partial<ProxyConfig> = {},
  deps: Omit<ProxyDeps, "logger"> = {},
): Promise<TestProxy> {
  const dir = await tempDir();
  const config: ProxyConfig = {
    ...buildConfig({ evccUrl, dataDir: "data", publicDir: "public", logLevel: "debug" }, dir),
    listen: { host: "127.0.0.1", port: 0 },
    ...overrides,
  };
  const logs: string[] = [];
  const logger = createLogger("debug", { out: (l) => logs.push(l), err: (l) => logs.push(l) });
  const proxy = createProxyServer(config, { logger, ...deps });
  const address = await proxy.listen();
  return { url: `http://127.0.0.1:${address.port}`, port: address.port, proxy, logs, config };
}
