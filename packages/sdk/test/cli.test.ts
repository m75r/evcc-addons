import { strFromU8, unzipSync } from "fflate";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const CLI = resolve(import.meta.dirname, "../bin/evcc-addon.mjs");

interface FixtureOptions {
  server?: boolean;
  license?: boolean;
}

/** Minimales Addon-Verzeichnis in tmp */
async function fixture(opts: FixtureOptions = {}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "evcc-addon-cli-"));
  await mkdir(join(dir, "src"));
  const manifest = { id: "demo", name: "Demo", version: "1.0.0", apiVersion: 2, entry: "index.js" };
  await writeFile(join(dir, "addon.json"), JSON.stringify(manifest));
  await writeFile(join(dir, "src/index.ts"), "export const activate = (): void => undefined;\n");
  await writeFile(join(dir, "THIRD_PARTY_NOTICES.md"), "# Third-party notices\n");
  if (opts.license !== false) await writeFile(join(dir, "LICENSE"), "MIT License\n");
  if (opts.server) {
    const code =
      'import { join } from "node:path";\nexport const activateServer = () => join("a", "b");\n';
    await writeFile(join(dir, "src/server.ts"), code);
  }
  return dir;
}

function build(dir: string, ...args: string[]): string {
  return execFileSync(process.execPath, [CLI, "build", dir, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function unzip(path: string): Promise<Record<string, Uint8Array>> {
  return unzipSync(new Uint8Array(await readFile(path)));
}

describe("evcc-addon build", () => {
  it("packt Bundle, Manifest, LICENSE und THIRD_PARTY_NOTICES.md nach <dir>/dist", async () => {
    const dir = await fixture();
    const zip = build(dir);
    expect(zip).toBe(join(dir, "dist/demo-1.0.0.zip"));
    const files = await unzip(zip);
    expect(Object.keys(files).sort()).toEqual([
      "LICENSE",
      "THIRD_PARTY_NOTICES.md",
      "addon.json",
      "index.js",
    ]);
    expect(strFromU8(files["index.js"])).toContain("evcc-addons addon demo");
    expect(JSON.parse(strFromU8(files["addon.json"]))).not.toHaveProperty("server");
  });

  it("baut mit src/server.ts zusätzlich server.mjs und setzt manifest.server", async () => {
    const dir = await fixture({ server: true });
    const files = await unzip(build(dir, "--out", join(dir, "out")));
    expect(files["server.mjs"]).toBeDefined();
    expect(strFromU8(files["server.mjs"])).toContain('from "node:path"');
    expect(JSON.parse(strFromU8(files["addon.json"]))).toMatchObject({ server: "server.mjs" });
  });

  it("überschreibt die Version mit --version", async () => {
    const dir = await fixture();
    const zip = build(dir, "--version", "1.2.3-beta.1");
    expect(zip.endsWith("demo-1.2.3-beta.1.zip")).toBe(true);
    const files = await unzip(zip);
    const manifest = JSON.parse(strFromU8(files["addon.json"])) as { version: string };
    expect(manifest.version).toBe("1.2.3-beta.1");
  });

  it("nimmt LICENSE und Hinweise mit --legal-dir aus einem anderen Verzeichnis", async () => {
    const dir = await fixture({ license: false });
    const legal = await fixture();
    const files = await unzip(build(dir, "--legal-dir", legal));
    expect(strFromU8(files.LICENSE)).toBe("MIT License\n");
  });

  it("bricht mit verständlicher Meldung ab, wenn LICENSE fehlt", async () => {
    const dir = await fixture({ license: false });
    expect(() => build(dir)).toThrow(/LICENSE fehlt in .* \(wird in die ZIP gepackt\)/);
    await rm(dir, { recursive: true, force: true });
  });

  it("lehnt unbekannte Befehle und Optionen ab", async () => {
    const dir = await fixture();
    expect(() => execFileSync(process.execPath, [CLI, "pack"], { stdio: "pipe" })).toThrow(
      /Aufruf: evcc-addon build/,
    );
    expect(() => build(dir, "--foo")).toThrow(/Unbekannte Option --foo/);
  });
});
