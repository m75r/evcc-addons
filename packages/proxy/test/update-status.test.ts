import { lstat, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseUpdateRequest,
  parseUpdateStatus,
  writeUpdateStatus,
  type UpdateStatus,
} from "../src/platform/update-status.js";
import { tempDir } from "./helpers.js";

const STATUS: UpdateStatus = {
  id: "0123abcd",
  state: "downloading",
  version: "2.2.0",
  at: "2026-11-10T10:00:00.000Z",
};

describe("writeUpdateStatus", () => {
  it("legt ein fehlendes Verzeichnis an und schreibt atomar ohne Reste", async () => {
    const dir = join(await tempDir(), "state");
    await writeUpdateStatus(dir, STATUS);
    expect(JSON.parse(await readFile(join(dir, "status.json"), "utf8"))).toEqual(STATUS);
    expect(await readdir(dir)).toEqual(["status.json"]);
    expect((await lstat(join(dir, "status.json"))).mode & 0o777).toBe(0o644);
  });

  it("ersetzt einen Symlink, ohne sein Ziel zu ändern", async () => {
    const dir = await tempDir();
    const target = join(dir, "ziel.txt");
    await writeFile(target, "geheim");
    await symlink(target, join(dir, "status.json"));
    await writeUpdateStatus(dir, { ...STATUS, state: "failed", message: "kaputt" });
    expect(await readFile(target, "utf8")).toBe("geheim");
    expect((await lstat(join(dir, "status.json"))).isSymbolicLink()).toBe(false);
    expect(parseUpdateStatus(await readFile(join(dir, "status.json"), "utf8"))).toMatchObject({
      state: "failed",
      message: "kaputt",
    });
  });
});

describe("parseUpdateRequest", () => {
  it("liest id und Version", () => {
    expect(parseUpdateRequest('{"id":"0123abcd","version":"2.2.0-rc.1"}')).toEqual({
      id: "0123abcd",
      version: "2.2.0-rc.1",
    });
  });

  it.each([
    ['{"id":"ZZZZZZZZ","version":"2.2.0"}', "keine gültige id"],
    ['{"id":"0123","version":"2.2.0"}', "keine gültige id"],
    ['{"id":"0123abcd","version":"2.2"}', "keine gültige Version"],
    ['{"id":"0123abcd","version":"geheim; rm -rf /"}', "keine gültige Version"],
    ["geheim-inhalt", "kein JSON"],
    ['["geheim"]', "kein JSON-Objekt"],
  ])("lehnt %s ab, ohne den Inhalt zu nennen", (text, reason) => {
    let message = "";
    try {
      parseUpdateRequest(text);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain(reason);
    expect(message).not.toMatch(/geheim|ZZZZ|rm -rf/);
  });
});

describe("parseUpdateStatus", () => {
  it.each(["", "kaputt", "[]", "{}", '{"id":"x","state":"unbekannt","version":"1","at":"t"}'])(
    "liefert null für %s",
    (text) => {
      expect(parseUpdateStatus(text)).toBeNull();
    },
  );

  it("übernimmt nur bekannte Felder", () => {
    const text = JSON.stringify({ ...STATUS, extra: 1, message: 42 });
    expect(parseUpdateStatus(text)).toEqual(STATUS);
  });
});
