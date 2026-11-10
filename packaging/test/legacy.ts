// Paket 1.2.1 als Ausgangsstand für Upgrade- und Self-Update-Tests. Es entsteht einmalig aus dem Tag 1.2.1
// (git worktree) und liegt dann in dist/legacy/.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const ROOT = resolve(import.meta.dirname, "../..");
export const VERSION = (
  JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as { version: string }
).version;
export const LEGACY_VERSION = "1.2.1";
export const LEGACY_DIR = resolve(ROOT, "dist/legacy");
export const LEGACY_DEB = `evcc-addons_${LEGACY_VERSION}_all.deb`;
/** Bau des Legacy-Pakets (npm ci, Build, nfpm) beim ersten Lauf */
export const BUILD_TIMEOUT_MS = 900_000;

function run(command: string, args: string[], cwd: string): void {
  try {
    execFileSync(command, args, { cwd, stdio: ["ignore", "ignore", "pipe"] });
  } catch (err) {
    const stderr = (err as { stderr?: Buffer }).stderr?.toString("utf8") ?? "";
    throw new Error(`${command} ${args.join(" ")} fehlgeschlagen:\n${stderr}`, { cause: err });
  }
}

/** Baut das Paket des Tags 1.2.1 in einem temporären worktree, falls es noch nicht vorliegt */
export function buildLegacyDeb(): void {
  if (existsSync(join(LEGACY_DIR, LEGACY_DEB))) return;
  const worktree = join(mkdtempSync(join(tmpdir(), "evcc-addons-legacy-")), "repo");
  run("git", ["worktree", "add", "--detach", worktree, LEGACY_VERSION], ROOT);
  try {
    run("npm", ["ci", "--no-audit", "--no-fund"], worktree);
    run("npm", ["run", "package"], worktree);
    mkdirSync(LEGACY_DIR, { recursive: true });
    copyFileSync(join(worktree, "dist", LEGACY_DEB), join(LEGACY_DIR, LEGACY_DEB));
  } finally {
    run("git", ["worktree", "remove", "--force", worktree], ROOT);
  }
}
