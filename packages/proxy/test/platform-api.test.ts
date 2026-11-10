import { mkdir, readFile, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FAKE_COOKIE, startFakeEvcc, type FakeEvcc } from "@evcc-addons/sdk/testing/fake-evcc";
import { createLogger, silentLogger } from "../src/logger.js";
import {
  PlatformService,
  defaultPlatformPaths,
  isUpdateAvailable,
  type PlatformPaths,
} from "../src/platform/service.js";
import { startFakeCatalog, type FakeCatalog } from "./fake-catalog.js";
import { startTestProxy, tempDir, type TestProxy } from "./helpers.js";
import { releaseJson } from "./release-fixtures.js";

const LOGIN = { cookie: FAKE_COOKIE };
const RELEASE_PATH = "/files/release.json";

let evcc: FakeEvcc;
let fake: FakeCatalog;
let proxy: TestProxy;
let clock: number;

function publishRelease(tag: string, fields: Record<string, unknown> = {}) {
  const name = `evcc-addons_${tag.replace(/^v/, "")}_all.deb`;
  const release = releaseJson({ tag_name: tag, downloadUrl: fake.fileUrl(name), ...fields });
  fake.set("release.json", JSON.stringify(release));
}

beforeEach(async () => {
  evcc = await startFakeEvcc();
  fake = await startFakeCatalog();
  clock = 1_000_000;
  const platform = new PlatformService({
    releaseUrl: fake.fileUrl("release.json"),
    currentVersion: "2.1.0",
    logger: silentLogger(),
    now: () => clock,
  });
  proxy = await startTestProxy(evcc.url, {}, { platform });
});

afterEach(async () => {
  await proxy.proxy.stop();
  await fake.close();
  await evcc.stop();
});

async function getPlatform(query = "", headers: Record<string, string> = LOGIN) {
  const res = await fetch(`${proxy.url}/addons-api/platform${query}`, { headers });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe("GET /addons-api/platform", () => {
  it("lehnt ohne Login mit 401 ab, ohne GitHub abzurufen", async () => {
    publishRelease("v2.2.0");
    const { status, body } = await getPlatform("", {});
    expect(status).toBe(401);
    expect(body).toMatchObject({ error: { code: "login-required" } });
    expect(fake.hits(RELEASE_PATH)).toBe(0);
  });

  it("meldet ein neueres Release als Update, ohne sha256", async () => {
    publishRelease("v2.2.0");
    const { status, body } = await getPlatform();
    expect(status).toBe(200);
    expect(body).toEqual({
      current: "2.1.0",
      latest: {
        version: "2.2.0",
        publishedAt: "2026-11-12T10:00:00Z",
        notesUrl: "https://github.com/m75r/evcc-addons/releases/tag/v2.2.0",
        downloadUrl: fake.fileUrl("evcc-addons_2.2.0_all.deb"),
      },
      updateAvailable: true,
      canInstall: false,
      checkError: null,
      update: null,
    });
  });

  it.each(["v2.1.0", "v2.0.0"])("meldet bei %s kein Update", async (tag) => {
    publishRelease(tag);
    const { body } = await getPlatform();
    expect(body.updateAvailable).toBe(false);
    expect(body.latest).toMatchObject({ version: tag.slice(1) });
  });

  it("liefert downloadUrl null ohne digest", async () => {
    publishRelease("v2.2.0", { digest: null });
    const { body } = await getPlatform();
    expect(body).toMatchObject({ latest: { downloadUrl: null }, updateAvailable: true });
  });

  it("hält das Release 1 h im Cache, ?refresh=1 ruft neu ab", async () => {
    publishRelease("v2.1.0");
    await getPlatform();
    publishRelease("v2.2.0");
    clock += 3_599_000;
    expect((await getPlatform()).body.updateAvailable).toBe(false);
    expect(fake.hits(RELEASE_PATH)).toBe(1);
    expect((await getPlatform("?refresh=1")).body.updateAvailable).toBe(true);
    expect(fake.hits(RELEASE_PATH)).toBe(2);
    clock += 3_600_000;
    await getPlatform();
    expect(fake.hits(RELEASE_PATH)).toBe(3);
  });

  it("meldet das Abruflimit als checkError mit Status 200", async () => {
    fake.setStatus(RELEASE_PATH, 403, { "x-ratelimit-remaining": "0" });
    const { status, body } = await getPlatform();
    expect(status).toBe(200);
    expect(body).toMatchObject({
      latest: null,
      updateAvailable: false,
      checkError: {
        code: "release-unavailable",
        message: "HTTP 403 (Abruflimit von GitHub erreicht)",
      },
    });
  });

  it("meldet eine ungültige Antwort als release-invalid", async () => {
    fake.set("release.json", "<html>");
    const { body } = await getPlatform();
    expect(body.checkError).toMatchObject({ code: "release-invalid" });
  });

  it("hält einen Fehler 5 min im Cache", async () => {
    fake.setStatus(RELEASE_PATH, 500);
    await getPlatform();
    clock += 299_000;
    await getPlatform();
    expect(fake.hits(RELEASE_PATH)).toBe(1);
    clock += 1_000;
    await getPlatform();
    expect(fake.hits(RELEASE_PATH)).toBe(2);
  });
});

describe("PlatformService", () => {
  it("teilt sich einen laufenden Abruf und loggt das Ergebnis", async () => {
    publishRelease("v2.2.0");
    const lines: string[] = [];
    const logger = createLogger("debug", { out: (l) => lines.push(l), err: (l) => lines.push(l) });
    const service = new PlatformService({
      releaseUrl: fake.fileUrl("release.json"),
      currentVersion: "2.1.0",
      logger,
    });
    const [a, b] = await Promise.all([service.info(), service.info(true)]);
    expect(a).toEqual(b);
    expect(fake.hits(RELEASE_PATH)).toBe(1);
    expect(lines.join("\n")).toMatch(
      /level=debug msg="platform release checked" current=2.1.0 latest=2.2.0 ms=\d+/,
    );
  });

  it("loggt einen Fehler als warn mit URL", async () => {
    fake.setStatus(RELEASE_PATH, 404);
    const lines: string[] = [];
    const logger = createLogger("info", { out: (l) => lines.push(l), err: (l) => lines.push(l) });
    const url = fake.fileUrl("release.json");
    const service = new PlatformService({ releaseUrl: url, currentVersion: "2.1.0", logger });
    await service.info();
    expect(lines).toEqual([
      `level=warn msg="platform release unavailable" url=${url} error="HTTP 404"`,
    ]);
  });

  it("meldet für die Entwicklerversion dev nie ein Update", async () => {
    publishRelease("v2.2.0");
    const service = new PlatformService({
      releaseUrl: fake.fileUrl("release.json"),
      currentVersion: "dev",
      logger: silentLogger(),
    });
    expect(isUpdateAvailable(await service.info())).toBe(false);
  });
});

/** Updater-Pfade in einem Temp-Verzeichnis; `overrides` z. B. für fehlende Dateien */
async function installPaths(overrides: Partial<PlatformPaths> = {}): Promise<PlatformPaths> {
  const dir = await tempDir();
  const paths: PlatformPaths = {
    updaterScript: join(dir, "opt/updater.mjs"),
    unitFile: join(dir, "evcc-addons-update.path"),
    statusFile: join(dir, "state/status.json"),
    requestFile: join(dir, "data/update/request.json"),
    watchedRequestFile: join(dir, "data/update/request.json"),
    ...overrides,
  };
  for (const file of [paths.updaterScript, paths.unitFile]) {
    if (!file?.startsWith(dir)) continue;
    await mkdir(join(file, ".."), { recursive: true });
    await writeFile(file, "");
  }
  return paths;
}

describe("Installation aus dem Popup", () => {
  let paths: PlatformPaths;
  let installer: TestProxy;
  /** Log des PlatformService */
  let serviceLogs: string[];

  async function startInstaller(overrides: Partial<PlatformPaths> = {}) {
    paths = await installPaths(overrides);
    serviceLogs = [];
    const sink = {
      out: (l: string) => serviceLogs.push(l),
      err: (l: string) => serviceLogs.push(l),
    };
    const platform = new PlatformService({
      releaseUrl: fake.fileUrl("release.json"),
      currentVersion: "2.1.0",
      logger: createLogger("info", sink),
      paths,
    });
    installer = await startTestProxy(evcc.url, {}, { platform });
  }

  afterEach(() => installer?.proxy.stop());

  function post(body: unknown, headers: Record<string, string> = LOGIN) {
    return fetch(`${installer.url}/addons-api/platform/update`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  }

  async function get() {
    const res = await fetch(`${installer.url}/addons-api/platform`, { headers: LOGIN });
    return (await res.json()) as Record<string, unknown>;
  }

  async function errorOf(res: Response) {
    return ((await res.json()) as { error: { code: string; message: string } }).error;
  }

  async function writeStatus(state: string, at: string, id = "aaaabbbb") {
    await mkdir(join(paths.statusFile, ".."), { recursive: true });
    await writeFile(paths.statusFile, JSON.stringify({ id, state, version: "2.2.0", at }));
  }

  it("meldet canInstall nur mit Updater, Path-Unit und überwachter Anforderung", async () => {
    publishRelease("v2.2.0");
    await startInstaller();
    expect((await get()).canInstall).toBe(true);
    await installer.proxy.stop();
    for (const overrides of [
      { updaterScript: null },
      { updaterScript: "/fehlt/updater.mjs" },
      { unitFile: "/fehlt/evcc-addons-update.path" },
      { watchedRequestFile: "/var/lib/evcc-addons/update/request.json" },
    ]) {
      await startInstaller(overrides);
      expect((await get()).canInstall).toBe(false);
      await installer.proxy.stop();
    }
  });

  it("liefert im Test (nicht unter /opt/evcc-addons) keinen updaterScript", () => {
    expect(defaultPlatformPaths("/var/lib/evcc-addons")).toEqual({
      updaterScript: null,
      unitFile: "/usr/lib/systemd/system/evcc-addons-update.path",
      statusFile: "/var/lib/evcc-addons-update/status.json",
      requestFile: "/var/lib/evcc-addons/update/request.json",
      watchedRequestFile: "/var/lib/evcc-addons/update/request.json",
    });
    expect(defaultPlatformPaths("/data", "/opt/evcc-addons").updaterScript).toBe(
      "/opt/evcc-addons/updater.mjs",
    );
  });

  it("legt bei Erfolg request.json an und antwortet 202 mit der id", async () => {
    publishRelease("v2.2.0");
    await startInstaller();
    const res = await post({ version: "2.2.0" });
    expect(res.status).toBe(202);
    const { id } = (await res.json()) as { id: string };
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.parse(await readFile(paths.requestFile, "utf8"))).toEqual({ id, version: "2.2.0" });
    expect(serviceLogs).toContain(
      `level=info msg="platform update requested" version=2.2.0 id=${id}`,
    );
  });

  it("lehnt ohne Login mit 401 und mit fremdem Origin mit 403 ab", async () => {
    publishRelease("v2.2.0");
    await startInstaller();
    expect((await post({ version: "2.2.0" }, {})).status).toBe(401);
    const origin = await post({ version: "2.2.0" }, { ...LOGIN, origin: "http://evil.example" });
    expect(origin.status).toBe(403);
    expect((await errorOf(origin)).code).toBe("origin-mismatch");
  });

  it.each([
    ["ohne canInstall", "v2.2.0", {}, { updaterScript: null }, "2.2.0"],
    ["ohne digest", "v2.2.0", { digest: null }, {}, "2.2.0"],
    ["bei anderer Version", "v2.2.0", {}, {}, "2.3.0"],
    ["ohne neuere Version", "v2.1.0", {}, {}, "2.1.0"],
  ])("lehnt %s mit 409 update-unavailable ab", async (_label, tag, fields, overrides, version) => {
    publishRelease(tag, fields);
    await startInstaller(overrides);
    const res = await post({ version });
    expect(res.status).toBe(409);
    expect((await errorOf(res)).code).toBe("update-unavailable");
    expect(installer.logs.join("\n")).toContain(
      `level=warn msg="platform update rejected" code=update-unavailable version=${version}`,
    );
  });

  it("lehnt einen ungültigen Body mit 400 ab", async () => {
    publishRelease("v2.2.0");
    await startInstaller();
    const res = await post({ version: 2 });
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe("body-invalid");
  });

  it("blockiert eine zweite Anforderung, nach 2 min nicht mehr", async () => {
    publishRelease("v2.2.0");
    await startInstaller();
    expect((await post({ version: "2.2.0" })).status).toBe(202);
    const second = await post({ version: "2.2.0" });
    expect(second.status).toBe(409);
    expect(await errorOf(second)).toEqual({
      code: "update-running",
      message: "Es läuft bereits eine Aktualisierung",
    });
    const old = new Date(Date.now() - 121_000);
    await utimes(paths.requestFile, old, old);
    expect((await post({ version: "2.2.0" })).status).toBe(202);
  });

  it("blockiert bei laufendem Updater, ein Zwischenstand älter als 15 min nicht", async () => {
    publishRelease("v2.2.0");
    await startInstaller();
    await writeStatus("installing", new Date(Date.now() - 60_000).toISOString());
    expect((await post({ version: "2.2.0" })).status).toBe(409);
    await writeStatus("installing", new Date(Date.now() - 901_000).toISOString());
    expect((await post({ version: "2.2.0" })).status).toBe(202);
  });

  it("liefert den Status des Updaters, null bei fehlender oder kaputter Datei", async () => {
    publishRelease("v2.2.0");
    await startInstaller();
    expect((await get()).update).toBeNull();
    await writeStatus("failed", "2026-11-10T10:00:00.000Z");
    expect((await get()).update).toEqual({
      id: "aaaabbbb",
      state: "failed",
      version: "2.2.0",
      at: "2026-11-10T10:00:00.000Z",
    });
    await writeFile(paths.statusFile, "{kaputt");
    expect((await get()).update).toBeNull();
  });
});
