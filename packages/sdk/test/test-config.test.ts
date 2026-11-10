import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  UNREACHABLE_CATALOG_URL,
  UNREACHABLE_RELEASE_URL,
  writeTestConfig,
} from "../src/testing/server.js";

async function readConfig(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

describe("writeTestConfig", () => {
  it("schreibt proxy.config.json mit unerreichbarem Katalog und Release", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdk-config-"));
    const path = writeTestConfig(root);
    expect(path).toBe(join(root, "e2e/.build/proxy.config.json"));
    expect(await readConfig(path)).toMatchObject({
      listen: { host: "127.0.0.1", port: 17080 },
      dataDir: join(root, "e2e/.data"),
      catalogUrl: UNREACHABLE_CATALOG_URL,
      releaseUrl: UNREACHABLE_RELEASE_URL,
    });
  });

  it("übernimmt catalogUrl und schreibt in die gewählte Datei", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdk-config-"));
    const catalogUrl = "http://127.0.0.1:17095/contents/addons";
    const running = writeTestConfig(root, { catalogUrl });
    const install = writeTestConfig(root, { file: "proxy.install.json" });
    expect(install).toBe(join(root, "e2e/.build/proxy.install.json"));
    expect((await readConfig(running)).catalogUrl).toBe(catalogUrl);
    expect((await readConfig(install)).catalogUrl).toBe(UNREACHABLE_CATALOG_URL);
  });

  it("übernimmt releaseUrl", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdk-config-"));
    const releaseUrl = "http://127.0.0.1:17095/releases/latest";
    expect((await readConfig(writeTestConfig(root, { releaseUrl }))).releaseUrl).toBe(releaseUrl);
  });
});
