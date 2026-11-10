// dpkg und apt-get für den Root-Updater; austauschbar für Tests
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { errorMessage } from "../util.js";

export interface DebFields {
  package: string;
  version: string;
}

export interface DpkgTools {
  /** Installierte Version von evcc-addons in Debian-Schreibweise */
  installedVersion: () => Promise<string>;
  /** Package und Version aus dem .deb */
  debFields: (file: string) => Promise<DebFields>;
  /** Pakete, die apt bei der Installation ändern würde (Inst, Conf, Remv, Purg) */
  simulateInstall: (file: string) => Promise<string[]>;
  aptInstall: (file: string) => Promise<void>;
}

export const PACKAGE_NAME = "evcc-addons";

const run = promisify(execFile);
const ENV = { ...process.env, DEBIAN_FRONTEND: "noninteractive" };
const APT_OPTIONS = ["--no-install-recommends", "--no-remove"];
const STDERR_LINES = 5;
const MAX_BUFFER = 16 * 1024 * 1024;

/** Debian-Vorabversion 2.2.0~rc.1 → semver 2.2.0-rc.1 (erstes "~") */
export function debianToSemver(version: string): string {
  return version.replace("~", "-");
}

async function exec(command: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await run(command, args, { env: ENV, maxBuffer: MAX_BUFFER });
    return stdout;
  } catch (err) {
    throw new Error(`${command} ${args[0]} fehlgeschlagen: ${failureDetail(err)}`, { cause: err });
  }
}

/** Letzte Zeilen von stderr, sonst die Meldung von execFile */
function failureDetail(err: unknown): string {
  const stderr = (err as { stderr?: string }).stderr?.trim() ?? "";
  if (stderr === "") return errorMessage(err);
  return stderr.split("\n").slice(-STDERR_LINES).join(" | ");
}

/** `Package: x` und `Version: y` aus der Ausgabe von dpkg-deb -f */
export function parseDebFields(output: string): DebFields {
  const field = (name: string) =>
    new RegExp(`^${name}: *(.+)$`, "m").exec(output)?.[1]?.trim() ?? "";
  return { package: field("Package"), version: field("Version") };
}

/** Paketnamen aus den Zeilen `Inst`, `Conf`, `Remv` und `Purg` einer Simulation, ohne Dubletten */
export function parseSimulation(output: string): string[] {
  const names = [...output.matchAll(/^(?:Inst|Conf|Remv|Purg) (\S+)/gm)].map((m) => m[1]);
  return [...new Set(names)];
}

export const systemDpkg: DpkgTools = {
  installedVersion: async () =>
    (await exec("dpkg-query", ["-W", "-f=${Version}", PACKAGE_NAME])).trim(),
  debFields: async (file) =>
    parseDebFields(await exec("dpkg-deb", ["-f", file, "Package", "Version"])),
  simulateInstall: async (file) =>
    parseSimulation(await exec("apt-get", ["install", "-s", ...APT_OPTIONS, file])),
  aptInstall: async (file) => {
    const lock = ["-o", "DPkg::Lock::Timeout=120", "-o", "Dpkg::Options::=--force-confold"];
    await exec("apt-get", ["install", "-y", ...APT_OPTIONS, ...lock, file]);
  },
};
