// Reine Hilfsfunktionen des Veröffentlichungs-Skripts (ohne Prozesse und Netz, getestet in scripts/test)

export const VERSION_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

const OPTIONS = { "--push": "push", "--with-addons": "withAddons", "--help": "help", "-h": "help" };

/** `--push` veröffentlicht, `--with-addons` testet und hebt die Addon-Repos; unbekannte Schalter werfen */
export function parseOptions(argv) {
  const options = { push: false, withAddons: false, help: false };
  for (const arg of argv) {
    const key = OPTIONS[arg];
    if (!key)
      throw new Error(`Unbekannter Schalter ${arg} (erlaubt: --push, --with-addons, --help)`);
    options[key] = true;
  }
  return options;
}

/** <0: a älter, 0: gleich, >0: a neuer (semver, Vorabversionen vor der Version ohne Zusatz) */
export function compareVersions(a, b) {
  const [coreA, preA = ""] = a.split(/-(.*)/s);
  const [coreB, preB = ""] = b.split(/-(.*)/s);
  const numsA = coreA.split(".").map(Number);
  const numsB = coreB.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (numsA[i] !== numsB[i]) return Math.sign(numsA[i] - numsB[i]);
  }
  if (preA === preB) return 0;
  if (preA === "" || preB === "") return preA === "" ? 1 : -1;
  return preA.localeCompare(preB, "en", { numeric: true });
}

/**
 * Tags, die noch ein Release brauchen: neuer als das neueste veröffentlichte Release und
 * höchstens `head`, aufsteigend sortiert
 */
export function pendingTags(tags, latestReleased, head) {
  return tags
    .filter((tag) => VERSION_PATTERN.test(tag))
    .filter((tag) => latestReleased === null || compareVersions(tag, latestReleased) > 0)
    .filter((tag) => compareVersions(tag, head) <= 0)
    .sort(compareVersions);
}

/** Abschnitt `## <version> …` aus RELEASES.md ohne Überschrift, null wenn er fehlt oder leer ist */
export function releaseSection(markdown, version) {
  const lines = markdown.split("\n");
  const heading = new RegExp(`^## ${version.replace(/[.+]/g, "\\$&")}(\\s|$)`);
  const start = lines.findIndex((line) => heading.test(line));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  const body = (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
  return body === "" ? null : body;
}

/** Relative Markdown-Links zeigen auf GitHub nicht ins Repo; sie werden auf `base` umgeschrieben */
export function absoluteLinks(text, base) {
  return text.replace(/\]\((?![a-z][a-z0-9+.-]*:|#)([^)\s]+)\)/gi, (_match, path) => {
    return `](${base.replace(/\/+$/, "")}/${path.replace(/^\.?\//, "")})`;
  });
}

/** Dateiname des .deb wie nfpm (Vorabversion mit "~") */
export function debFileName(version) {
  return `evcc-addons_${version.replace("-", "~")}_all.deb`;
}

export function sdkFileName(version) {
  return `evcc-addons-sdk-${version}.tgz`;
}

const SDK_URL = /(\/releases\/download\/)[^/"]+\/evcc-addons-sdk-[^/"]+\.tgz/;

/** Setzt die Tarball-URL des SDK in einer package.json auf `version`; ohne SDK-URL Fehler */
export function withSdkVersion(packageJson, version) {
  if (!SDK_URL.test(packageJson)) throw new Error("package.json enthält keine SDK-URL");
  return packageJson.replace(SDK_URL, `$1${version}/${sdkFileName(version)}`);
}

/** Version des SDK aus der Tarball-URL einer package.json, sonst null */
export function sdkVersionOf(packageJson) {
  return /\/evcc-addons-sdk-([^/"]+)\.tgz/.exec(packageJson)?.[1] ?? null;
}

/** Repo-Namen der Addons aus den Katalog-YAMLs (`homepage: https://github.com/<owner>/<repo>`) */
export function addonRepoNames(yamlTexts) {
  const names = yamlTexts.map((text) => {
    const homepage = /^homepage:\s*["']?https:\/\/github\.com\/[^/\s]+\/([^/\s"']+)/m.exec(text);
    if (!homepage) throw new Error("Katalogeintrag ohne homepage auf github.com");
    return homepage[1].replace(/\.git$/, "");
  });
  return [...new Set(names)].sort();
}

/** owner/repo aus der URL des Remotes (https oder ssh) */
export function repoSlug(remoteUrl) {
  const match = /github\.com[/:]([^/]+\/[^/]+?)(\.git)?\/?$/.exec(remoteUrl.trim());
  if (!match) throw new Error(`Remote ${remoteUrl} ist kein GitHub-Repo`);
  return match[1];
}
