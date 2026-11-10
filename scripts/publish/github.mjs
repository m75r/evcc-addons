// Releases auf GitHub über die gh-CLI: Entwurf anlegen, Assets hochladen, erst dann veröffentlichen
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { capture, info, run } from "./shell.mjs";
import { VERSION_PATTERN, compareVersions } from "./lib.mjs";

/** Alle Releases mit Tag und Entwurfs-Status */
function listReleases(slug) {
  const json = capture("gh", [
    "release",
    "list",
    "--repo",
    slug,
    "--limit",
    "200",
    "--json",
    "tagName,isDraft",
  ]);
  return JSON.parse(json);
}

/**
 * Neueste veröffentlichte Version (null ohne Release). Ein Entwurf für einen der `tags` bricht ab:
 * er stammt von einem abgebrochenen Lauf und muss erst von Hand geprüft und gelöscht werden.
 */
export function releaseState(slug, tags) {
  const releases = listReleases(slug);
  const drafts = releases.filter((r) => r.isDraft && tags.includes(r.tagName));
  if (drafts.length > 0) {
    const names = drafts.map((r) => r.tagName).join(", ");
    throw new Error(`Auf GitHub liegen Entwürfe für ${names}; bitte prüfen und löschen`);
  }
  const published = releases
    .filter((r) => !r.isDraft && VERSION_PATTERN.test(r.tagName))
    .map((r) => r.tagName)
    .sort(compareVersions);
  return { latest: published.at(-1) ?? null, published };
}

/** Prüft, dass gh angemeldet ist */
export function assertGhReady() {
  capture("gh", ["auth", "status"]);
}

/**
 * Legt das Release als Entwurf an, lädt die Assets hoch und veröffentlicht es dann. So zeigt
 * releases/latest nie auf ein Release ohne .deb (sonst Badge ohne installierbares Paket).
 */
export function publishRelease({ slug, tag, files, notes, latest }) {
  const notesFile = join(tmpdir(), `evcc-addons-release-${tag}.md`);
  writeFileSync(notesFile, notes + "\n");
  const repo = ["--repo", slug];
  run("gh", [
    "release",
    "create",
    tag,
    ...repo,
    "--draft",
    "--verify-tag",
    "--title",
    tag,
    "--notes-file",
    notesFile,
  ]);
  run("gh", ["release", "upload", tag, ...repo, ...files]);
  run("gh", ["release", "edit", tag, ...repo, "--draft=false", `--latest=${latest}`]);
  info(`Release ${tag} veröffentlicht${latest ? " (latest)" : ""}`);
}

/** releases/latest muss `tag` mit allen Assets samt sha256-digest liefern (Grundlage des Updaters) */
export function verifyLatest(slug, tag, names) {
  const latest = JSON.parse(capture("gh", ["api", `repos/${slug}/releases/latest`]));
  if (latest.tag_name !== tag) {
    throw new Error(`releases/latest liefert ${latest.tag_name}, erwartet ${tag}`);
  }
  for (const name of names) {
    const asset = latest.assets.find((candidate) => candidate.name === name);
    if (!asset?.digest?.startsWith("sha256:")) {
      throw new Error(`Asset ${name} fehlt in releases/latest oder hat keinen sha256-digest`);
    }
  }
  info(`releases/latest = ${tag}, Assets mit digest: ${names.join(", ")}`);
}
