import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { AddonError } from "../src/addons/errors.js";
import { validateSwitchInput, type SwitchConfig } from "../src/switches/model.js";
import { SwitchStore } from "../src/switches/store.js";
import { tempDir } from "./helpers.js";

const INPUT = {
  name: "Dyson Luftreiniger",
  type: "tapo",
  host: "192.168.1.50",
  user: "ich@example.com",
  password: "geheim",
  loadpoint: "Dyson Luftreiniger (Wohnzimmer)",
};

let dir: string;
let store: SwitchStore;

beforeEach(async () => {
  dir = await tempDir();
  store = new SwitchStore(dir);
  await store.load();
});

async function fileContent() {
  return JSON.parse(await readFile(join(dir, "switches.json"), "utf8")) as {
    version: number;
    switches: SwitchConfig[];
  };
}

describe("SwitchStore", () => {
  it("legt an mit id, Token und Dateirechten 0600", async () => {
    const created = await store.create(validateSwitchInput(INPUT));
    expect(created.id).toMatch(/^[0-9a-f]{8}$/);
    expect(created.token).toMatch(/^[0-9a-f]{64}$/);
    expect(await fileContent()).toEqual({ version: 1, switches: [created] });
    expect((await stat(join(dir, "switches.json"))).mode & 0o777).toBe(0o600);
  });

  it("bearbeitet; ein leeres Passwort bleibt unverändert", async () => {
    const created = await store.create(validateSwitchInput(INPUT));
    const fields = validateSwitchInput({ ...INPUT, name: "Lampe", password: "" }, created);
    const updated = await store.update(created.id, fields);
    expect(updated).toMatchObject({ name: "Lampe", password: "geheim", token: created.token });
    const reloaded = new SwitchStore(dir);
    await reloaded.load();
    expect(reloaded.get(created.id)).toEqual(updated);
  });

  it("erneuert den Token und löscht", async () => {
    const created = await store.create(validateSwitchInput(INPUT));
    const renewed = await store.renewToken(created.id);
    expect(renewed.token).not.toBe(created.token);
    await store.remove(created.id);
    expect(store.list()).toEqual([]);
    expect((await fileContent()).switches).toEqual([]);
    await expect(store.remove(created.id)).rejects.toMatchObject({ code: "not-found" });
  });

  it("meldet eine ungültige Datei mit Pfad und Ursache", async () => {
    await writeFile(join(dir, "switches.json"), "{ kaputt");
    await expect(new SwitchStore(dir).load()).rejects.toThrow(
      `${join(dir, "switches.json")} ungültig:`,
    );
    await writeFile(join(dir, "switches.json"), JSON.stringify({ switches: [{ id: "a" }] }));
    await expect(new SwitchStore(dir).load()).rejects.toThrow("Eintrag 0: unbekannter Typ");
  });

  it("begrenzt auf 50 Steckdosen", async () => {
    for (let i = 0; i < 50; i++) await store.create(validateSwitchInput(INPUT));
    await expect(store.create(validateSwitchInput(INPUT))).rejects.toMatchObject({
      code: "switch-invalid",
    });
  });
});

describe("validateSwitchInput", () => {
  it.each([
    [{ name: "" }, "name", "Name fehlt"],
    [{ name: "x".repeat(61) }, "name", "Name ist länger als 60 Zeichen"],
    [{ type: "shelly" }, "type", 'Typ "shelly" wird nicht unterstützt (erlaubt: tapo)'],
    [{ host: "http://192.168.1.50" }, "host", "Adresse muss die Form host oder host:port haben"],
    [{ host: "tapo.local/app" }, "host", "Adresse muss"],
    [{ host: "tapo.local:70000" }, "host", "Adresse muss"],
    [{ user: " " }, "user", "Tapo-E-Mail fehlt"],
    [{ password: "" }, "password", "Tapo-Passwort fehlt"],
    [{ password: "x".repeat(201) }, "password", "Tapo-Passwort ist länger als 200 Zeichen"],
    [{ loadpoint: "" }, "loadpoint", "evcc-Ladepunkt fehlt"],
  ])("lehnt %j ab", (change, field, message) => {
    let error: unknown;
    try {
      validateSwitchInput({ ...INPUT, ...change });
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(AddonError);
    expect(error).toMatchObject({ code: "switch-invalid", details: { field } });
    expect((error as Error).message).toContain(message);
  });

  it("akzeptiert host:port und trimmt Texte", () => {
    const fields = validateSwitchInput({ ...INPUT, name: " Lampe ", host: "tapo.local:8080" });
    expect(fields).toMatchObject({ name: "Lampe", host: "tapo.local:8080", password: "geheim" });
  });
});
