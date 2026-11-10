// Addon-Repos (Geschwisterordner, Liste aus dem Katalog addons/*.yaml): gegen den neuen SDK-Tarball testen
// und nach dem Release auf das neue SDK heben
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { addonRepoNames, sdkVersionOf, withSdkVersion } from "./lib.mjs";
import { capture, info, run, step } from "./shell.mjs";

/** Repos aus dem Katalog, erwartet als Geschwisterordner des Plattform-Repos */
export function addonRepos(root) {
  const dir = join(root, "addons");
  const texts = readdirSync(dir)
    .filter((name) => name.endsWith(".yaml"))
    .map((name) => readFileSync(join(dir, name), "utf8"));
  return addonRepoNames(texts).map((name) => ({ name, dir: resolve(root, "..", name) }));
}

/** Jedes Repo ist vorhanden, sauber und auf main */
export function assertAddonReposReady(repos) {
  for (const repo of repos) {
    if (!existsSync(join(repo.dir, "package.json"))) {
      throw new Error(`Addon-Repo ${repo.name} fehlt unter ${repo.dir}`);
    }
    if (capture("git", ["status", "--porcelain"], repo.dir) !== "") {
      throw new Error(`Addon-Repo ${repo.name} hat uncommittete Änderungen`);
    }
    const branch = capture("git", ["branch", "--show-current"], repo.dir);
    if (branch !== "main")
      throw new Error(`Addon-Repo ${repo.name} steht auf ${branch}, nicht main`);
  }
}

/**
 * Testet jedes Addon in einem temporären Worktree gegen den lokalen Tarball (lint, test, ohne
 * `skipE2e` auch e2e). Die Arbeitskopie des Addon-Repos bleibt unberührt.
 */
export function testAddonsAgainst(repos, tarball, { skipE2e = false } = {}) {
  const scripts = skipE2e ? ["lint", "test"] : ["lint", "test", "e2e"];
  for (const repo of repos) {
    step(`Addon ${repo.name} gegen ${tarball.split("/").at(-1)} testen`);
    const worktree = join(mkdtempSync(join(tmpdir(), `${repo.name}-`)), "repo");
    run("git", ["worktree", "add", "--detach", worktree, "HEAD"], repo.dir);
    try {
      run("npm", ["ci", "--no-audit", "--no-fund"], worktree);
      run("npm", ["install", "--no-save", "--no-audit", "--no-fund", tarball], worktree);
      for (const script of scripts) run("npm", ["run", script], worktree);
    } finally {
      run("git", ["worktree", "remove", "--force", worktree], repo.dir);
    }
  }
}

/**
 * Hebt jedes Addon auf das veröffentlichte SDK `version`: URL in package.json, npm install (Lockfile mit
 * Integrity-Hash vom Release), lint, test, Commit und Push. Ein gescheitertes Repo hält die anderen nicht auf.
 */
export function bumpAddons(repos, version) {
  const failed = [];
  for (const repo of repos) {
    step(`Addon ${repo.name} auf SDK ${version} heben`);
    try {
      bumpAddon(repo, version);
    } catch (err) {
      failed.push(`${repo.name}: ${err.message}`);
      info(`übersprungen: ${err.message}`);
    }
  }
  if (failed.length > 0) {
    throw new Error(
      `SDK-Update unvollständig, bitte von Hand nachziehen:\n- ${failed.join("\n- ")}`,
    );
  }
}

function bumpAddon(repo, version) {
  const file = join(repo.dir, "package.json");
  const text = readFileSync(file, "utf8");
  if (sdkVersionOf(text) === version) return info(`bereits auf SDK ${version}`);
  writeFileSync(file, withSdkVersion(text, version));
  run("npm", ["install", "--no-audit", "--no-fund"], repo.dir);
  run("npm", ["run", "lint"], repo.dir);
  run("npm", ["test"], repo.dir);
  run("git", ["add", "package.json", "package-lock.json"], repo.dir);
  const message = `chore(deps): SDK ${version}\n\nSDK-Tarball auf das Plattform-Release ${version} umgestellt. Das Addon selbst ist unverändert.`;
  run("git", ["commit", "-m", message], repo.dir);
  run("git", ["push", "origin", "main"], repo.dir);
}
