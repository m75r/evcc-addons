import { mkdir, writeFile } from "node:fs/promises";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { silentLogger } from "../src/logger.js";
import { resolveInside, serveFile } from "../src/static/files.js";
import { tempDir } from "./helpers.js";

let base = "";
let server: http.Server;
let root = "";

beforeAll(async () => {
  const dir = await tempDir();
  root = join(dir, "public");
  await mkdir(root);
  await writeFile(join(root, "loader.js"), "export {};");
  await writeFile(join(root, "style.css"), "a{}");
  await writeFile(join(dir, "secret.txt"), "geheim");
  // Der Server reicht den Rohpfad ohne Normalisierung an serveFile weiter
  server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
    void serveFile(req, res, root, (req.url ?? "/").slice(1), silentLogger());
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

function rawGet(path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    http
      .get(base + "/", { path }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      })
      .on("error", reject);
  });
}

describe("serveFile", () => {
  it("liefert Dateien mit Content-Type und no-cache", async () => {
    const res = await fetch(`${base}/loader.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(await res.text()).toBe("export {};");
    expect((await fetch(`${base}/style.css`)).headers.get("content-type")).toContain("text/css");
  });

  it("antwortet 304 bei passender ETag", async () => {
    const etag = (await fetch(`${base}/loader.js`)).headers.get("etag") ?? "";
    expect(etag).toMatch(/^W\/"/);
    const res = await fetch(`${base}/loader.js`, { headers: { "if-none-match": etag } });
    expect(res.status).toBe(304);
  });

  it.each(["/../secret.txt", "/%2e%2e/secret.txt", "/..%2fsecret.txt", "/fehlt.js", "/"])(
    "liefert 404 für %s",
    async (path) => {
      expect(await rawGet(path)).toBe(404);
    },
  );
});

describe("resolveInside", () => {
  it("lehnt Backslashes und Nullbytes ab", () => {
    expect(resolveInside("/srv", "a\\b")).toBeNull();
    expect(resolveInside("/srv", "a%00b")).toBeNull();
    expect(resolveInside("/srv", "%E0%A4%A")).toBeNull();
    expect(resolveInside("/srv", "a/b.js")).toBe("/srv/a/b.js");
  });
});
