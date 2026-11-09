import { readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { migrateLegacySwitches } from "../src/addons/legacy-migration.js";
import { createLogger } from "../src/logger.js";
import { tempDir } from "./helpers.js";

const CONTENT = '{"version":1,"switches":[]}\n';

let dataDir: string;
let logs: string[];

beforeEach(async () => {
  dataDir = await tempDir();
  logs = [];
});

const logger = () =>
  createLogger("info", { out: (line) => logs.push(line), err: (line) => logs.push(line) });
const legacy = () => join(dataDir, "switches.json");
const target = () => join(dataDir, "addon-data/switches-tapo/switches.json");

describe("migrateLegacySwitches", () => {
  it("verschiebt switches.json mit Rechten 0600, wenn das Ziel fehlt", async () => {
    await writeFile(legacy(), CONTENT, { mode: 0o600 });
    await migrateLegacySwitches(dataDir, logger());
    expect(await readFile(target(), "utf8")).toBe(CONTENT);
    expect((await stat(target())).mode & 0o777).toBe(0o600);
    expect((await stat(join(dataDir, "addon-data/switches-tapo"))).mode & 0o777).toBe(0o700);
    await expect(stat(legacy())).rejects.toMatchObject({ code: "ENOENT" });
    expect(logs).toContain(
      `level=info msg="legacy switches migrated" from=${legacy()} to=${target()}`,
    );
  });

  it("lässt die Quelle unangetastet, wenn das Ziel schon existiert", async () => {
    await writeFile(legacy(), CONTENT);
    await mkdir(join(dataDir, "addon-data/switches-tapo"), { recursive: true });
    await writeFile(target(), "neu");
    await migrateLegacySwitches(dataDir, logger());
    expect(await readFile(legacy(), "utf8")).toBe(CONTENT);
    expect(await readFile(target(), "utf8")).toBe("neu");
  });

  it("tut nichts ohne Quelle", async () => {
    await migrateLegacySwitches(dataDir, logger());
    await expect(stat(join(dataDir, "addon-data"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(logs).toEqual([]);
  });
});
