import { describe, expect, it } from "vitest";
import {
  absoluteLinks,
  addonRepoNames,
  compareVersions,
  debFileName,
  parseOptions,
  pendingTags,
  releaseSection,
  repoSlug,
  sdkVersionOf,
  withSdkVersion,
} from "../publish/lib.mjs";

describe("parseOptions", () => {
  it("kennt --push, --skip-addons, --skip-tests und --help, Standard ist ein Prüflauf mit allem", () => {
    expect(parseOptions([])).toEqual({
      push: false,
      skipAddons: false,
      skipTests: false,
      help: false,
    });
    expect(parseOptions(["--push", "--skip-addons", "--skip-tests"])).toEqual({
      push: true,
      skipAddons: true,
      skipTests: true,
      help: false,
    });
    expect(parseOptions(["-h"]).help).toBe(true);
  });

  it("lehnt unbekannte Schalter ab", () => {
    expect(() => parseOptions(["--with-addons"])).toThrow(
      "Unbekannter Schalter --with-addons (erlaubt: --push, --skip-addons, --skip-tests, --help)",
    );
  });
});

describe("Versionen und offene Tags", () => {
  it("vergleicht nach semver", () => {
    expect(compareVersions("2.10.0", "2.9.0")).toBe(1);
    expect(compareVersions("2.2.0", "2.2.0")).toBe(0);
    expect(compareVersions("2.2.0-rc.1", "2.2.0")).toBe(-1);
    expect(compareVersions("2.2.0-rc.10", "2.2.0-rc.2")).toBe(1);
  });

  it("liefert Tags nach dem neuesten Release bis HEAD, aufsteigend", () => {
    const tags = ["1.0.0", "2.1.0", "2.2.1", "2.2.0", "2.3.0", "kein-tag"];
    expect(pendingTags(tags, "2.1.0", "2.2.1")).toEqual(["2.2.0", "2.2.1"]);
    expect(pendingTags(tags, "2.2.1", "2.2.1")).toEqual([]);
    expect(pendingTags(["1.0.0", "1.1.0"], null, "1.1.0")).toEqual(["1.0.0", "1.1.0"]);
  });
});

describe("releaseSection", () => {
  const markdown = [
    "# Versionshinweise",
    "",
    "Einleitung",
    "",
    "## 2.2.1 (2026-11-11)",
    "",
    "- Escape schließt Fenster zuverlässig.",
    "",
    "## 2.2.0 (2026-11-10)",
    "",
    "**Neu.** Text",
    "",
    "## 2.1.0",
    "",
  ].join("\n");

  it("liefert den Abschnitt einer Version ohne Überschrift", () => {
    expect(releaseSection(markdown, "2.2.1")).toBe("- Escape schließt Fenster zuverlässig.");
    expect(releaseSection(markdown, "2.2.0")).toBe("**Neu.** Text");
  });

  it("liefert null für fehlende, leere oder nur ähnliche Versionen", () => {
    expect(releaseSection(markdown, "2.1.0")).toBeNull();
    expect(releaseSection(markdown, "2.2")).toBeNull();
    expect(releaseSection(markdown, "2.2.10")).toBeNull();
  });
});

describe("absoluteLinks", () => {
  const base = "https://github.com/m75r/evcc-addons/blob/2.2.0";

  it("schreibt relative Links auf GitHub um, absolute und Anker bleiben", () => {
    const text =
      "[README](README.md#update), [Doku](./ADDON-DEVELOPMENT.md), [evcc](https://evcc.io), [oben](#neu)";
    expect(absoluteLinks(text, base)).toBe(
      `[README](${base}/README.md#update), [Doku](${base}/ADDON-DEVELOPMENT.md), [evcc](https://evcc.io), [oben](#neu)`,
    );
  });
});

describe("SDK-URL in den Addon-Repos", () => {
  const pkg = `{
  "devDependencies": {
    "@evcc-addons/sdk": "https://github.com/m75r/evcc-addons/releases/download/2.1.0/evcc-addons-sdk-2.1.0.tgz",
    "eslint": "^10.14.0"
  }
}
`;

  it("setzt Tag und Dateiname auf die neue Version und lässt den Rest unverändert", () => {
    const updated = withSdkVersion(pkg, "2.2.1");
    expect(updated).toBe(pkg.replaceAll("2.1.0", "2.2.1"));
    expect(sdkVersionOf(updated)).toBe("2.2.1");
  });

  it("wirft ohne SDK-URL", () => {
    expect(() => withSdkVersion('{"name":"x"}', "2.2.1")).toThrow("keine SDK-URL");
    expect(sdkVersionOf('{"name":"x"}')).toBeNull();
  });
});

describe("Namen und Slugs", () => {
  it("liest die Addon-Repos aus den Katalogeinträgen", () => {
    const yaml = (repo) => `id: x\nhomepage: https://github.com/m75r/${repo}\nversion: 1.0.0\n`;
    expect(
      addonRepoNames([
        yaml("evcc-addon-hello"),
        yaml("evcc-addon-consumers"),
        yaml("evcc-addon-hello"),
      ]),
    ).toEqual(["evcc-addon-consumers", "evcc-addon-hello"]);
    expect(() => addonRepoNames(["id: x\n"])).toThrow("ohne homepage");
  });

  it("liest owner/repo aus https- und ssh-Remotes", () => {
    expect(repoSlug("https://github.com/m75r/evcc-addons.git")).toBe("m75r/evcc-addons");
    expect(repoSlug("git@github.com:m75r/evcc-addons.git")).toBe("m75r/evcc-addons");
    expect(() => repoSlug("https://gitlab.com/x/y")).toThrow("kein GitHub-Repo");
  });

  it("schreibt Vorabversionen im Dateinamen des .deb wie nfpm", () => {
    expect(debFileName("2.2.0-rc.1")).toBe("evcc-addons_2.2.0~rc.1_all.deb");
  });
});
