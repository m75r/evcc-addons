import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigError, defaultPublicDir, loadConfig } from "../src/config.js";
import { tempDir } from "./helpers.js";

async function writeConfig(content: unknown): Promise<string> {
  const dir = await tempDir();
  const path = join(dir, "config.json");
  await writeFile(path, typeof content === "string" ? content : JSON.stringify(content));
  return path;
}

describe("loadConfig", () => {
  it("ergänzt Defaults", async () => {
    const config = await loadConfig(await writeConfig({}));
    expect(config).toEqual({
      listen: { host: "0.0.0.0", port: 80 },
      evccUrl: "http://127.0.0.1:7070",
      dataDir: "/var/lib/evcc-addons",
      publicDir: defaultPublicDir(),
      maxUploadBytes: 10485760,
      logLevel: "info",
    });
  });

  it("löst relative Pfade gegen das Verzeichnis der Datei auf", async () => {
    const path = await writeConfig({ dataDir: "../data", publicDir: "pub" });
    const dir = join(path, "..");
    const config = await loadConfig(path);
    expect(config.dataDir).toBe(join(dir, "..", "data"));
    expect(config.publicDir).toBe(join(dir, "pub"));
  });

  it("entfernt einen abschließenden Schrägstrich der evccUrl", async () => {
    const config = await loadConfig(await writeConfig({ evccUrl: "http://pi:7070/" }));
    expect(config.evccUrl).toBe("http://pi:7070");
  });

  it.each([0, 65536, 1.5, "80"])("lehnt Port %s ab", async (port) => {
    const path = await writeConfig({ listen: { port } });
    await expect(loadConfig(path)).rejects.toThrow(/listen\.port/);
  });

  it.each(["ftp://pi", "kein-url", 7070])("lehnt evccUrl %s ab", async (evccUrl) => {
    const path = await writeConfig({ evccUrl });
    await expect(loadConfig(path)).rejects.toThrow(/evccUrl/);
  });

  it("meldet eine fehlende Datei verständlich", async () => {
    const path = join(await tempDir(), "fehlt.json");
    const error = await loadConfig(path).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as Error).message).toContain(`Konfigurationsdatei ${path} nicht lesbar`);
  });

  it("meldet ungültiges JSON", async () => {
    await expect(loadConfig(await writeConfig("{kaputt"))).rejects.toThrow(/ungültig/);
  });
});
