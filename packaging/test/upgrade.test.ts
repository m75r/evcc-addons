// Upgrade 1.2.1 → aktuelle Version im Debian-Container: Übernahme von switches.json nach
// addon-data/switches-tapo/ und ein installiertes consumers 1.1.0 (apiVersion 1) läuft weiter.
// Das Paket 1.2.1 kommt aus legacy.ts (einmalig gebaut, dann in dist/legacy/).
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  BUILD_TIMEOUT_MS,
  LEGACY_DEB,
  LEGACY_DIR,
  LEGACY_VERSION,
  ROOT,
  VERSION,
  buildLegacyDeb,
} from "./legacy.js";

function inContainer(script: string): string {
  const mounts = ["-v", `${resolve(ROOT, "dist")}:/pkg:ro`, "-v", `${LEGACY_DIR}:/legacy:ro`];
  try {
    return execFileSync(
      "docker",
      ["run", "--rm", ...mounts, "node:22-bookworm-slim", "sh", "-c", script],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (err) {
    const { stdout, stderr } = err as { stdout?: string; stderr?: string };
    throw new Error(`Upgrade-Container fehlgeschlagen:\n${stdout ?? ""}\n${stderr ?? ""}`, {
      cause: err,
    });
  }
}

/** Steckdose im Format von 1.2.1 (version 1, Feld loadpoint) */
const LEGACY_SWITCHES = JSON.stringify({
  version: 1,
  switches: [
    {
      id: "lampe",
      name: "Lampe",
      type: "tapo",
      host: "127.0.0.1:9",
      user: "ich@example.com",
      password: "tapo-secret",
      loadpoint: "Lampe",
      token: "ab".repeat(32),
    },
  ],
});

const UPGRADE = `
set -e
dpkg -i --force-depends /legacy/${LEGACY_DEB} > /dev/null
AS="su -s /bin/sh evcc-addons -c"
$AS "node /opt/evcc-addons/server.mjs install --config /etc/evcc-addons/config.json /opt/evcc-addons/addons/consumers-1.1.0.zip"
printf '%s' '${LEGACY_SWITCHES}' > /var/lib/evcc-addons/switches.json
chown evcc-addons: /var/lib/evcc-addons/switches.json
chmod 600 /var/lib/evcc-addons/switches.json
dpkg -i --force-depends /pkg/evcc-addons_${VERSION}_all.deb > /dev/null
$AS "exec node /opt/evcc-addons/server.mjs --config /etc/evcc-addons/config.json" > /tmp/proxy.log 2>&1 &
PROXY=$!
node -e '
  const get = (p) => fetch("http://127.0.0.1" + p);
  (async () => {
    for (let i = 0; i < 50; i++) {
      try { await get("/addons-api/health"); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
    }
    const addons = await (await get("/addons-api/addons")).json();
    console.log("addons=" + JSON.stringify(addons.map((a) => ({ id: a.id, version: a.version, error: a.error }))));
  })().catch((err) => { console.error(err); process.exit(1); });
'
kill $PROXY
echo "log=$(cat /tmp/proxy.log | tr '\\n' ' ')"
echo "mode=$(stat -c %a /var/lib/evcc-addons/addon-data/switches-tapo/switches.json)"
if [ -e /var/lib/evcc-addons/switches.json ]; then echo "old=yes"; else echo "old=no"; fi
`;

describe(`Upgrade ${LEGACY_VERSION} → ${VERSION}`, () => {
  beforeAll(buildLegacyDeb, BUILD_TIMEOUT_MS);

  it("übernimmt switches.json und lässt consumers 1.1.0 laufen", () => {
    const output = inContainer(UPGRADE);
    expect(output).toContain('addons=[{"id":"consumers","version":"1.1.0","error":null}]');
    expect(output).toMatch(/log=.*msg="legacy switches migrated"/);
    expect(output).toContain("mode=600");
    expect(output).toContain("old=no");
  });
});
