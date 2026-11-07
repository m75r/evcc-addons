// Prüft das gebaute .deb in Debian-Containern: Metadaten, Inhalt, Installation, Purge, Shellcheck
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const VERSION = (
  JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as { version: string }
).version;
const DEB = `evcc-addons_${VERSION}_all.deb`;
const SCRIPTS = ["preinstall.sh", "postinstall.sh", "preremove.sh", "postremove.sh"];

/** Führt ein Shell-Skript in einem Container mit dist/ unter /pkg aus */
function inContainer(image: string, script: string): string {
  try {
    return execFileSync(
      "docker",
      ["run", "--rm", "-v", `${resolve(ROOT, "dist")}:/pkg:ro`, image, "sh", "-c", script],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (err) {
    const { stdout, stderr } = err as { stdout?: string; stderr?: string };
    throw new Error(`Container ${image} fehlgeschlagen:\n${stdout ?? ""}\n${stderr ?? ""}`, {
      cause: err,
    });
  }
}

describe("Paket-Metadaten", () => {
  it("hat Name, Architektur und Abhängigkeit", () => {
    const fields = inContainer(
      "debian:bookworm-slim",
      `dpkg-deb -f /pkg/${DEB} Package Architecture Depends Version`,
    );
    expect(fields).toContain("Package: evcc-addons");
    expect(fields).toContain("Architecture: all");
    expect(fields).toContain("Depends: nodejs (>= 22)");
    expect(fields).toContain(`Version: ${VERSION}`);
  });

  it("enthält Server, Loader, mitgelieferte Addons, Unit und Konfiguration, aber keine Fixtures", () => {
    const listing = inContainer("debian:bookworm-slim", `dpkg-deb -c /pkg/${DEB}`);
    for (const path of [
      "./opt/evcc-addons/server.mjs",
      "./opt/evcc-addons/public/loader.js",
      "./opt/evcc-addons/addons/consumers-1.1.0.zip",
      "./opt/evcc-addons/addons/hello-0.1.0.zip",
      "./usr/lib/systemd/system/evcc-addons.service",
      "./etc/evcc-addons/config.json",
    ]) {
      expect(listing).toContain(path);
    }
    expect(listing).not.toMatch(/test-addon|broken-addon|zip-slip/);
  });

  it("führt die Konfiguration als Conffile", () => {
    const conffiles = inContainer("debian:bookworm-slim", `dpkg-deb -I /pkg/${DEB} conffiles`);
    expect(conffiles.trim()).toBe("/etc/evcc-addons/config.json");
  });
});

describe("Installation (node:22-bookworm-slim)", () => {
  it("installiert, startet, liefert Addons aus und wird per purge vollständig entfernt", () => {
    const output = inContainer("node:22-bookworm-slim", SMOKE_TEST);
    expect(output).toContain("user=evcc-addons");
    expect(output).toContain("owner=evcc-addons");
    expect(output).toContain('health={"status":"ok","version":"' + VERSION + '"}');
    expect(output).toContain("loader=200");
    expect(output).toContain("addons=consumers");
    expect(output).toContain("purged=yes");
  });
});

describe("Maintainer-Skripte", () => {
  it("bestehen shellcheck", () => {
    const args = [
      "run",
      "--rm",
      "-v",
      `${resolve(ROOT, "packaging/scripts")}:/mnt:ro`,
      "koalaman/shellcheck:stable",
    ];
    expect(() =>
      execFileSync("docker", [...args, ...SCRIPTS.map((s) => `/mnt/${s}`)], { stdio: "pipe" }),
    ).not.toThrow();
  });
});

const SMOKE_TEST = `
set -e
dpkg -i --force-depends /pkg/${DEB}
echo "user=$(getent passwd evcc-addons | cut -d: -f1)"
echo "owner=$(stat -c %U /var/lib/evcc-addons)"
su -s /bin/sh evcc-addons -c "node /opt/evcc-addons/server.mjs install --config /etc/evcc-addons/config.json /opt/evcc-addons/addons/consumers-1.1.0.zip"
node /opt/evcc-addons/server.mjs --config /etc/evcc-addons/config.json > /tmp/proxy.log 2>&1 &
PROXY=$!
node -e '
  const get = (p) => fetch("http://127.0.0.1" + p);
  const wait = async () => {
    for (let i = 0; i < 50; i++) {
      try { return await get("/addons-api/health"); } catch { await new Promise((r) => setTimeout(r, 100)); }
    }
    throw new Error("Proxy startet nicht");
  };
  (async () => {
    const health = await wait();
    console.log("health=" + JSON.stringify(await health.json()));
    console.log("loader=" + (await get("/addons-static/_core/loader.js")).status);
    const addons = await (await get("/addons-api/addons")).json();
    console.log("addons=" + addons.map((a) => a.id).join(","));
  })().catch((err) => { console.error(err); process.exit(1); });
'
kill $PROXY
dpkg --purge evcc-addons
if [ -e /var/lib/evcc-addons ]; then echo "purged=no"; else echo "purged=yes"; fi
`;
