import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AddonError } from "../src/addons/errors.js";
import { checkAdmin, checkOrigin } from "../src/api/auth.js";
import {
  FAKE_API_KEY,
  FAKE_COOKIE,
  startFakeEvcc,
  type AuthMode,
  type FakeEvcc,
} from "@evcc-addons/sdk/testing/fake-evcc";

let evcc: FakeEvcc;

beforeAll(async () => {
  evcc = await startFakeEvcc();
});

afterAll(() => evcc.stop());

const req = (headers: Record<string, string> = {}) => ({ headers });

async function check(mode: AuthMode, headers: Record<string, string> = {}, timeoutMs?: number) {
  evcc.auth.mode = mode;
  return checkAdmin(req(headers), evcc.url, timeoutMs);
}

describe("checkAdmin", () => {
  it.each([
    [true, { ok: true }],
    [false, { ok: false, status: 401, code: "login-required" }],
    [501, { ok: false, status: 403, code: "admin-password-missing" }],
    [403, { ok: false, status: 403, code: "demo-mode" }],
  ] as const)("bildet %s ab", async (mode, expected) => {
    expect(await check(mode)).toMatchObject(expected);
  });

  it("meldet evcc-unreachable bei Timeout", async () => {
    const result = await check({ delayMs: 500 }, {}, 100);
    expect(result).toMatchObject({ ok: false, status: 502, code: "evcc-unreachable" });
  });

  it("meldet evcc-unreachable bei Netzwerkfehler", async () => {
    const result = await checkAdmin(req(), "http://127.0.0.1:1");
    expect(result).toMatchObject({ ok: false, status: 502, code: "evcc-unreachable" });
  });

  it("reicht Cookie und Authorization weiter, sonst nichts", async () => {
    const result = await check("cookie", { cookie: FAKE_COOKIE, "x-other": "1" });
    expect(result).toEqual({ ok: true });
    expect(evcc.auth.lastHeaders?.cookie).toBe(FAKE_COOKIE);
    expect(evcc.auth.lastHeaders?.["x-other"]).toBeUndefined();
    expect(await check("cookie", { authorization: FAKE_API_KEY })).toEqual({ ok: true });
    expect(await check("cookie")).toMatchObject({ code: "login-required" });
  });
});

describe("checkOrigin", () => {
  it("akzeptiert passenden und fehlenden Origin", () => {
    expect(() => checkOrigin(req({ host: "pi", origin: "http://pi" }))).not.toThrow();
    expect(() => checkOrigin(req({ host: "pi:7080", origin: "http://pi:7080" }))).not.toThrow();
    expect(() => checkOrigin(req({ host: "pi" }))).not.toThrow();
  });

  it.each(["http://evil.example", "null", "http://pi:81"])("lehnt Origin %s ab", (origin) => {
    let error: unknown;
    try {
      checkOrigin(req({ host: "pi", origin }));
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(AddonError);
    expect((error as AddonError).code).toBe("origin-mismatch");
  });
});
