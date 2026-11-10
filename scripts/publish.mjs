// Veröffentlicht die getaggte Version auf GitHub, nach /release-commit (Commit und Tag gibt es schon).
// Aufruf: bin/release.sh [--push] [--skip-addons] [--skip-tests] oder npm run release -- <Schalter>
//
// Ohne --push ein reiner Prüflauf: Vorbedingungen, lint, test, e2e, test:package (baut .deb und SDK-Tarball),
// jedes Addon gegen den neuen Tarball, Assets älterer Tags ohne Release.
// Mit --push danach: main und Tags pushen, je Tag ein Release (Entwurf, Assets, veröffentlichen), Prüfung
// von releases/latest, dann die Addon-Repos auf das neue SDK heben.
// --skip-addons lässt die Addon-Repos ganz aus, --skip-tests die E2E-Tests (Plattform und Addons).
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  addonRepos,
  assertAddonReposReady,
  bumpAddons,
  testAddonsAgainst,
} from "./publish/addons.mjs";
import { assertGhReady, publishRelease, releaseState, verifyLatest } from "./publish/github.mjs";
import {
  absoluteLinks,
  debFileName,
  parseOptions,
  pendingTags,
  releaseSection,
  repoSlug,
  sdkFileName,
} from "./publish/lib.mjs";
import { capture, info, run, step } from "./publish/shell.mjs";

const root = resolve(import.meta.dirname, "..");

const USAGE = `bin/release.sh [--push] [--skip-addons] [--skip-tests]
(oder npm run release -- <Schalter>)

  (ohne)          Prüflauf mit Addons: nichts wird gepusht oder veröffentlicht
  --push          main und Tags pushen, Releases auf GitHub veröffentlichen, Addons auf das neue SDK heben
  --skip-addons   Addon-Repos weder testen noch auf das neue SDK heben
  --skip-tests    E2E-Tests von Plattform und Addons überspringen (lint, test, test:package laufen)
`;

const git = (...args) => capture("git", args, root);

/** Sauberer Stand auf main; Version aus package.json, getaggt, wenn das Tag auf HEAD zeigt */
function checkWorkingTree() {
  if (git("status", "--porcelain") !== "") throw new Error("Working Tree ist nicht sauber");
  const branch = git("branch", "--show-current");
  if (branch !== "main") throw new Error(`Branch ist ${branch}, nicht main`);
  const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const tagged = git("tag", "--points-at", "HEAD").split("\n").includes(version);
  info(`Version ${version}${tagged ? ", Tag auf HEAD" : ", ohne Tag auf HEAD"}`);
  return { version, tagged };
}

/** Lokales main darf origin/main nur voraus sein */
function checkRemote() {
  run("git", ["fetch", "--quiet", "origin"], root);
  try {
    git("merge-base", "--is-ancestor", "origin/main", "HEAD");
  } catch (err) {
    throw new Error("origin/main enthält Commits, die lokal fehlen (erst pullen)", { cause: err });
  }
}

/**
 * Tags bis HEAD ohne Release, aufsteigend; HEAD-Version zuletzt. Jedes braucht für --push einen
 * Abschnitt in RELEASES.md, im Prüflauf reicht eine Warnung. Ohne Tag auf HEAD zählt package.json.
 */
function planReleases(slug, version, strict) {
  const tags = git("tag", "--merged", "HEAD").split("\n").filter(Boolean);
  const { latest, published } = releaseState(slug, tags);
  if (published.includes(version)) throw new Error(`Release ${version} gibt es schon auf GitHub`);
  const pending = [...new Set([...pendingTags(tags, latest, version), version])];
  const markdown = readFileSync(join(root, "RELEASES.md"), "utf8");
  const releases = pending.map((tag) => ({ tag, notes: releaseSection(markdown, tag) }));
  const missing = releases.filter((r) => r.notes === null).map((r) => r.tag);
  const problem = `RELEASES.md hat keinen Abschnitt für ${missing.join(", ")}`;
  if (missing.length > 0 && strict) throw new Error(problem);
  if (missing.length > 0) info(`Warnung: ${problem} (für --push nötig)`);
  info(
    `Neuestes Release auf GitHub: ${latest ?? "keins"}; zu veröffentlichen: ${pending.join(", ")}`,
  );
  return releases;
}

/** Alles, was vor einer Veröffentlichung grün sein muss; test:package baut die Assets */
function verifyPlatform(skipE2e) {
  const scripts = skipE2e
    ? ["lint", "test", "test:package"]
    : ["lint", "test", "e2e", "test:package"];
  if (skipE2e) info("E2E-Tests übersprungen (--skip-tests)");
  for (const script of scripts) {
    step(`npm run ${script}`);
    run("npm", ["run", script], root);
  }
}

function assetNames(version) {
  return [debFileName(version), sdkFileName(version)];
}

/** Assets der HEAD-Version aus dist/ (von test:package frisch gebaut) */
function headAssets(version) {
  const files = assetNames(version).map((name) => join(root, "dist", name));
  const missing = files.filter((file) => !existsSync(file));
  if (missing.length > 0) throw new Error(`Assets fehlen: ${missing.join(", ")}`);
  return files;
}

/** Baut die Assets eines älteren Tags in einem temporären Worktree nach dist/release/<tag>/ */
function buildTagAssets(tag) {
  step(`Assets von ${tag} bauen (Worktree)`);
  const worktree = join(mkdtempSync(join(tmpdir(), `evcc-addons-${tag}-`)), "repo");
  const target = join(root, "dist/release", tag);
  run("git", ["worktree", "add", "--detach", worktree, tag], root);
  try {
    run("npm", ["ci", "--no-audit", "--no-fund"], worktree);
    run("npm", ["run", "package"], worktree);
    mkdirSync(target, { recursive: true });
    for (const name of assetNames(tag))
      copyFileSync(join(worktree, "dist", name), join(target, name));
  } finally {
    run("git", ["worktree", "remove", "--force", worktree], root);
  }
  return assetNames(tag).map((name) => join(target, name));
}

/** Assets je Release: HEAD aus dist/, ältere Tags aus eigenem Worktree-Build */
function collectAssets(releases, version) {
  return releases.map((release) => ({
    ...release,
    files: release.tag === version ? headAssets(version) : buildTagAssets(release.tag),
  }));
}

/** Push von main und Tags, dann die Releases der Reihe nach; das letzte wird latest */
function publish(slug, releases, version) {
  step("main und Tags pushen");
  run("git", ["push", "origin", "main"], root);
  run("git", ["push", "origin", ...releases.map((r) => `refs/tags/${r.tag}`)], root);
  for (const release of releases) {
    step(`Release ${release.tag} auf GitHub`);
    const notes = absoluteLinks(release.notes, `https://github.com/${slug}/blob/${release.tag}`);
    const latest = release.tag === version;
    publishRelease({ slug, tag: release.tag, files: release.files, notes, latest });
  }
  step("releases/latest prüfen");
  verifyLatest(slug, version, assetNames(version));
}

/** Prüfungen ohne Wirkung nach außen; liefert alles, was für die Veröffentlichung nötig ist */
function prepare(options) {
  step("Vorbedingungen");
  const { version, tagged } = checkWorkingTree();
  if (options.push && !tagged)
    throw new Error(`Tag ${version} zeigt nicht auf HEAD (erst /release-commit)`);
  const slug = repoSlug(git("remote", "get-url", "origin"));
  assertGhReady();
  if (options.push) checkRemote();
  const repos = options.skipAddons ? [] : addonRepos(root);
  if (options.skipAddons) info("Addon-Repos übersprungen (--skip-addons)");
  assertAddonReposReady(repos);
  if (repos.length > 0) info(`Addon-Repos: ${repos.map((r) => r.name).join(", ")}`);
  const releases = planReleases(slug, version, options.push);
  return { version, slug, repos, releases };
}

function main(argv) {
  const options = parseOptions(argv);
  if (options.help) return void process.stdout.write(USAGE);
  const { version, slug, repos, releases } = prepare(options);
  verifyPlatform(options.skipTests);
  const tarball = join(root, "dist", sdkFileName(version));
  if (repos.length > 0) testAddonsAgainst(repos, tarball, { skipE2e: options.skipTests });
  const withAssets = collectAssets(releases, version);
  if (!options.push) return summary(withAssets, repos, false);
  publish(slug, withAssets, version);
  if (repos.length > 0) bumpAddons(repos, version);
  summary(withAssets, repos, true);
}

function summary(releases, repos, pushed) {
  step(pushed ? "Fertig" : "Prüflauf fertig, nichts gepusht");
  const tags = releases.map((r) => r.tag).join(", ");
  info(pushed ? `Veröffentlicht: ${tags}` : `Mit --push würden veröffentlicht: ${tags}`);
  if (repos.length > 0) {
    const names = repos.map((r) => r.name).join(", ");
    info(pushed ? `Addons auf neues SDK gehoben: ${names}` : `Addons getestet: ${names}`);
  }
}

try {
  main(process.argv.slice(2));
} catch (err) {
  process.stderr.write(`\n✖ ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
}
