// Test-Proxy für E2E-Tests: Konfiguration schreiben, Addons per CLI installieren, server.mjs starten.
// Nutzt runtime/ aus dem SDK-Tarball oder im Monorepo die frisch gebauten Pakete.
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Feste Ports der E2E-Umgebung: evcc im Docker-Container, Proxy auf dem Host */
export const EVCC_PORT = 17070;
export const PROXY_PORT = 17080;

export interface TestProxyOptions {
  /** Wurzel des Repos (absolut); Daten unter e2e/.data, Konfiguration unter e2e/.build */
  root: string;
  /** Addon-ZIPs relativ zu `root` oder absolut */
  zips?: string[];
}

export interface RuntimePaths {
  server: string;
  publicDir: string;
}

/** packages/sdk (aus src/testing oder dist/testing zwei Ebenen höher) */
const SDK_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** Im Monorepo die gebauten Pakete, sonst runtime/ aus dem Tarball derselben Plattform-Version */
export function runtimePaths(): RuntimePaths {
  const monorepo = {
    server: join(SDK_ROOT, "../proxy/dist/server.mjs"),
    publicDir: join(SDK_ROOT, "../loader/dist"),
  };
  if (existsSync(monorepo.server)) return monorepo;
  const runtime = join(SDK_ROOT, "runtime");
  return { server: join(runtime, "server.mjs"), publicDir: join(runtime, "public") };
}

export function dataDirOf(root: string): string {
  return join(root, "e2e/.data");
}

/** Schreibt e2e/.build/proxy.config.json und liefert den Pfad */
export function writeTestConfig(root: string): string {
  const path = join(root, "e2e/.build/proxy.config.json");
  const config = {
    listen: { host: "127.0.0.1", port: PROXY_PORT },
    evccUrl: `http://127.0.0.1:${EVCC_PORT}`,
    dataDir: dataDirOf(root),
    publicDir: runtimePaths().publicDir,
    logLevel: "info",
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(config, null, 2) + "\n");
  return path;
}

function absolute(root: string, file: string): string {
  return isAbsolute(file) ? file : resolve(root, file);
}

function runInstall(opts: TestProxyOptions, reset: boolean): void {
  const args = [runtimePaths().server, "install", "--config", writeTestConfig(opts.root)];
  if (reset) args.push("--reset");
  args.push(...(opts.zips ?? []).map((zip) => absolute(opts.root, zip)));
  try {
    execFileSync(process.execPath, args, {
      cwd: opts.root,
      stdio: ["ignore", "ignore", "inherit"],
    });
  } catch (err) {
    throw new Error(`Installation der Test-Addons fehlgeschlagen: ${(err as Error).message}`, {
      cause: err,
    });
  }
}

/** Installiert ZIPs zusätzlich (CLI `install`) */
export function installAddons(opts: TestProxyOptions): void {
  runInstall(opts, false);
}

/** Entfernt alle Addons samt addon-data/ und installiert `zips` (CLI `install --reset`) */
export function resetAddons(opts: TestProxyOptions): void {
  runInstall(opts, true);
}

/** Frisches Datenverzeichnis, Seed-Addons installieren, server.mjs starten; Signale gehen weiter */
export function startTestProxy(opts: TestProxyOptions): ChildProcess {
  rmSync(dataDirOf(opts.root), { recursive: true, force: true });
  mkdirSync(dataDirOf(opts.root), { recursive: true });
  resetAddons(opts);
  const child = spawn(
    process.execPath,
    [runtimePaths().server, "--config", writeTestConfig(opts.root)],
    { stdio: "inherit" },
  );
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
  return child;
}
