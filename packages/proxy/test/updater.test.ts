import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, realpath, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildConfig } from "../src/config.js";
import { createLogger } from "../src/logger.js";
import { parseUpdateStatus, type UpdateStatus } from "../src/platform/update-status.js";
import type { DpkgTools } from "../src/updater/dpkg.js";
import { debianToSemver, parseDebFields, parseSimulation } from "../src/updater/dpkg.js";
import { runUpdate, type UpdaterDeps } from "../src/updater/run.js";
import { sha256 } from "./catalog-fixtures.js";
import { startFakeCatalog, type FakeCatalog } from "./fake-catalog.js";
import { tempDir } from "./helpers.js";
import { releaseJson } from "./release-fixtures.js";

const ID = "0123abcd";
const DEB = randomBytes(2048);

let fake: FakeCatalog;
let dataDir: string;
let statusDir: string;
let tmpDir: string;
let logs: string[];
/** Zustand der status.json bei debFields (nach dem Download) und bei aptInstall */
let seen: string[];

/** Echte Pfade (unter macOS liegt tmpdir hinter dem Symlink /var) */
async function realTemp(): Promise<string> {
  return realpath(await tempDir());
}

beforeEach(async () => {
  fake = await startFakeCatalog();
  dataDir = await realTemp();
  statusDir = join(await realTemp(), "state");
  tmpDir = await realTemp();
  logs = [];
  seen = [];
  publish("v2.2.0");
});

afterEach(() => fake.close());

function publish(tag: string, fields: Record<string, unknown> = {}, bytes: Uint8Array = DEB) {
  const name = `evcc-addons_${tag.replace(/^v/, "").replace("-", "~")}_all.deb`;
  fake.set(name, bytes);
  const release = releaseJson({
    tag_name: tag,
    assetName: name,
    downloadUrl: fake.fileUrl(name),
    digest: `sha256:${sha256(bytes)}`,
    ...fields,
  });
  fake.set("release.json", JSON.stringify(release));
}

async function writeRequest(content: string | object = { id: ID, version: "2.2.0" }) {
  await mkdir(join(dataDir, "update"), { recursive: true });
  const text = typeof content === "string" ? content : JSON.stringify(content);
  await writeFile(requestFile(), text);
}

const requestFile = () => join(dataDir, "update/request.json");

async function readStatus(): Promise<UpdateStatus | null> {
  try {
    return parseUpdateStatus(await readFile(join(statusDir, "status.json"), "utf8"));
  } catch {
    return null;
  }
}

async function recordState(): Promise<void> {
  seen.push((await readStatus())?.state ?? "none");
}

function fakeDpkg(overrides: Partial<DpkgTools> = {}): DpkgTools {
  return {
    installedVersion: vi.fn(() => Promise.resolve("2.1.0")),
    debFields: vi.fn(async (file: string) => {
      await recordState();
      expect(await readFile(file)).toEqual(DEB);
      return { package: "evcc-addons", version: "2.2.0" };
    }),
    simulateInstall: vi.fn(() => Promise.resolve(["evcc-addons"])),
    aptInstall: vi.fn(async () => recordState()),
    ...overrides,
  };
}

function deps(dpkg: DpkgTools = fakeDpkg(), extra: Partial<UpdaterDeps> = {}): UpdaterDeps {
  const config = buildConfig({ dataDir, releaseUrl: fake.fileUrl("release.json") }, dataDir);
  const logger = createLogger("info", { out: (l) => logs.push(l), err: (l) => logs.push(l) });
  return { config, statusDir, tmpDir, logger, dpkg, ...extra };
}

/** Lauf mit erwartetem Fehler: Rückgabe false, Status failed mit der Meldung */
async function expectFailure(
  dpkg: DpkgTools,
  message: string | RegExp,
  extra: Partial<UpdaterDeps> = {},
) {
  await writeRequest();
  expect(await runUpdate(deps(dpkg, extra))).toBe(false);
  const status = await readStatus();
  expect(status).toMatchObject({ id: ID, state: "failed", version: "2.2.0" });
  expect(status?.message).toMatch(message);
  expect(logs.join("\n")).toContain(`level=error msg="update failed" id=${ID} version=2.2.0`);
  expect(existsSync(requestFile())).toBe(false);
  expect(await readdir(tmpDir)).toEqual([]);
}

describe("runUpdate", () => {
  it("installiert mit der Statusfolge downloading → installing → done", async () => {
    await writeRequest();
    const dpkg = fakeDpkg();
    expect(await runUpdate(deps(dpkg))).toBe(true);
    expect(seen).toEqual(["downloading", "installing"]);
    expect(await readStatus()).toMatchObject({ id: ID, state: "done", version: "2.2.0" });
    expect(existsSync(requestFile())).toBe(false);
    expect(dpkg.aptInstall).toHaveBeenCalledOnce();
    expect(await readdir(tmpDir)).toEqual([]);
    const text = logs.join("\n");
    expect(text).toContain(
      `level=info msg="update started" id=${ID} version=2.2.0 installed=2.1.0`,
    );
    expect(text).toContain(`level=info msg="update downloaded" version=2.2.0 bytes=${DEB.length}`);
    expect(text).toContain('level=info msg="update installed" version=2.2.0');
  });

  it("schreibt ohne Anforderung keinen Status", async () => {
    const dpkg = fakeDpkg();
    expect(await runUpdate(deps(dpkg))).toBe(true);
    await mkdir(join(dataDir, "update"));
    expect(await runUpdate(deps(dpkg))).toBe(true);
    expect(await readStatus()).toBeNull();
    expect(dpkg.installedVersion).not.toHaveBeenCalled();
    expect(fake.hits("/files/release.json")).toBe(0);
    expect(logs[0]).toBe('level=info msg="update skipped" reason="no request"');
  });

  it.each([
    ["kaputtem JSON", () => writeRequest("geheim{")],
    ["ungültiger id", () => writeRequest({ id: "x", version: "2.2.0" })],
    ["über 1 KB", () => writeRequest({ id: ID, version: "2.2.0", pad: "x".repeat(1100) })],
    [
      "Symlink",
      async () => {
        const secret = join(await realTemp(), "secret.txt");
        await writeFile(secret, '{"id":"0123abcd","version":"2.2.0"} geheim');
        await mkdir(join(dataDir, "update"), { recursive: true });
        await symlink(secret, requestFile());
      },
    ],
    [
      "FIFO",
      async () => {
        await mkdir(join(dataDir, "update"), { recursive: true });
        execFileSync("mkfifo", [requestFile()]);
      },
    ],
  ])("lehnt eine Anforderung mit %s ab und löscht sie", async (_label, prepare) => {
    await prepare();
    expect(await runUpdate(deps())).toBe(false);
    expect(await readStatus()).toBeNull();
    expect(existsSync(requestFile())).toBe(false);
    expect(logs.join("\n")).toMatch(/level=error msg="update failed" error=/);
    expect(logs.join("\n")).not.toContain("geheim");
    expect(fake.hits("/files/release.json")).toBe(0);
  });

  it("lässt eine Anforderung in einem Verzeichnis-Symlink unangetastet", async () => {
    const elsewhere = await realTemp();
    await writeFile(join(elsewhere, "request.json"), JSON.stringify({ id: ID, version: "2.2.0" }));
    await symlink(elsewhere, join(dataDir, "update"));
    expect(await runUpdate(deps())).toBe(false);
    expect(await readStatus()).toBeNull();
    expect(existsSync(join(elsewhere, "request.json"))).toBe(true);
    expect(logs.join("\n")).toContain("ist kein Verzeichnis");
  });

  it("lehnt eine andere Version als releases/latest ab", async () => {
    publish("v2.3.0");
    await expectFailure(fakeDpkg(), "Angefordert ist 2.2.0, GitHub bietet 2.3.0 an");
  });

  it.each([
    ["2.2.0", "2.2.0"],
    ["2.3.0", "2.3.0"],
    ["2.2.0~rc.1 gegenüber 2.2.0-rc.1", "2.2.0~rc.1"],
  ])("installiert nicht, wenn installiert %s ist", async (_label, installed) => {
    const isRc = installed.includes("rc");
    if (isRc) publish("v2.2.0-rc.1");
    const dpkg = fakeDpkg({ installedVersion: () => Promise.resolve(installed) });
    await mkdir(join(dataDir, "update"), { recursive: true });
    await writeFile(
      requestFile(),
      JSON.stringify({ id: ID, version: isRc ? "2.2.0-rc.1" : "2.2.0" }),
    );
    expect(await runUpdate(deps(dpkg))).toBe(false);
    expect((await readStatus())?.message).toMatch(/^Installiert ist .+, kein Update auf/);
    expect(dpkg.aptInstall).not.toHaveBeenCalled();
    expect(fake.hits("/files/evcc-addons_2.2.0_all.deb")).toBe(0);
  });

  it("installiert eine Vorabversion in Debian-Schreibweise", async () => {
    publish("v2.2.0-rc.1");
    await writeRequest({ id: ID, version: "2.2.0-rc.1" });
    const dpkg = fakeDpkg({
      debFields: () => Promise.resolve({ package: "evcc-addons", version: "2.2.0~rc.1" }),
    });
    expect(await runUpdate(deps(dpkg))).toBe(true);
    expect(await readStatus()).toMatchObject({ state: "done", version: "2.2.0-rc.1" });
  });

  it("lehnt eine falsche Prüfsumme ab", async () => {
    publish("v2.2.0", { digest: `sha256:${"b".repeat(64)}` });
    const dpkg = fakeDpkg();
    await expectFailure(dpkg, /^Prüfsumme von evcc-addons_2\.2\.0_all\.deb stimmt nicht/);
    expect(dpkg.aptInstall).not.toHaveBeenCalled();
  });

  it("lehnt ein Release ohne digest ab", async () => {
    publish("v2.2.0", { digest: null });
    await expectFailure(fakeDpkg(), "Das Release enthält kein Paket mit Prüfsumme");
  });

  it("lehnt ein .deb mit anderem Paketnamen ab", async () => {
    const dpkg = fakeDpkg({
      debFields: () => Promise.resolve({ package: "evil", version: "2.2.0" }),
    });
    await expectFailure(dpkg, "Paket enthält evil 2.2.0, erwartet evcc-addons 2.2.0");
    expect(dpkg.aptInstall).not.toHaveBeenCalled();
  });

  it("lehnt ab, wenn apt weitere Pakete ändern würde", async () => {
    const dpkg = fakeDpkg({
      simulateInstall: () => Promise.resolve(["nodejs", "evcc-addons", "libc6"]),
    });
    await expectFailure(dpkg, "Das Update würde weitere Pakete ändern: nodejs, libc6");
    expect(dpkg.aptInstall).not.toHaveBeenCalled();
  });

  it("meldet einen Fehler von apt-get mit dem Ausschnitt aus stderr", async () => {
    const dpkg = fakeDpkg({
      aptInstall: async () => {
        await recordState();
        throw new Error("apt-get install fehlgeschlagen: E: Sub-process /usr/bin/dpkg returned 1");
      },
    });
    await expectFailure(dpkg, /dpkg returned 1/);
    expect(seen).toEqual(["downloading", "installing"]);
  });

  it("lehnt einen Download über dem Limit ab", async () => {
    await expectFailure(
      fakeDpkg(),
      "Download von evcc-addons_2.2.0_all.deb fehlgeschlagen: Antwort ist größer als 1024 Bytes",
      { maxBytes: 1024 },
    );
  });

  it("meldet einen nicht erreichbaren Release-Server", async () => {
    fake.setStatus("/files/release.json", 403, { "x-ratelimit-remaining": "0" });
    await expectFailure(fakeDpkg(), "HTTP 403 (Abruflimit von GitHub erreicht)");
  });
});

describe("dpkg-Ausgaben", () => {
  it("liest Package und Version aus dpkg-deb -f", () => {
    expect(parseDebFields("Package: evcc-addons\nVersion: 2.2.0~rc.1\n")).toEqual({
      package: "evcc-addons",
      version: "2.2.0~rc.1",
    });
  });

  it("liest die Pakete einer Simulation", () => {
    const output = [
      "Reading package lists...",
      "Inst nodejs [18.0.0] (22.1.0 nodesource [arm64])",
      "Inst evcc-addons [2.1.0] (2.2.0 local-deb [all])",
      "Conf nodejs (22.1.0 nodesource [arm64])",
      "Conf evcc-addons (2.2.0 local-deb [all])",
      "Remv old-pkg [1.0]",
    ].join("\n");
    expect(parseSimulation(output)).toEqual(["nodejs", "evcc-addons", "old-pkg"]);
  });

  it("wandelt die erste Tilde in einen Bindestrich", () => {
    expect(debianToSemver("2.2.0~rc.1")).toBe("2.2.0-rc.1");
    expect(debianToSemver("2.2.0")).toBe("2.2.0");
  });
});
