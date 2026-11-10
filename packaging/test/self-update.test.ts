// Root-Updater mit echtem dpkg/apt im Debian-Container: Update 1.2.1 → aktuelle Version über request.json,
// Release von einem Fake-Server. Ein Dummy-Paket nodejs erfüllt die Abhängigkeit (Node liegt im Image unter
// /usr/local). Fehlerfälle laufen vor dem Erfolg, alle in einem Container; jede Zeile hat das Präfix des Falls.
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  BUILD_TIMEOUT_MS,
  LEGACY_DEB,
  LEGACY_DIR,
  ROOT,
  VERSION,
  buildLegacyDeb,
} from "./legacy.js";

const DEB = `evcc-addons_${VERSION}_all.deb`;
const CASES = ["symlink", "wrongversion", "digest", "dependency", "success"] as const;
type Case = (typeof CASES)[number];

function inContainer(script: string): string {
  const mounts = [
    ["-v", `${resolve(ROOT, "dist")}:/pkg:ro`],
    ["-v", `${LEGACY_DIR}:/legacy:ro`],
    ["-v", `${resolve(ROOT, "packaging/test")}:/test:ro`],
  ].flat();
  try {
    return execFileSync(
      "docker",
      ["run", "--rm", ...mounts, "node:22-bookworm-slim", "sh", "-c", script],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024 },
    );
  } catch (err) {
    const { stdout, stderr } = err as { stdout?: string; stderr?: string };
    throw new Error(`Self-Update-Container fehlgeschlagen:\n${stdout ?? ""}\n${stderr ?? ""}`, {
      cause: err,
    });
  }
}

/** Zeilen `<fall>.<feld>=<wert>` als Objekt je Fall */
function parseOutput(output: string): Record<Case, Record<string, string>> {
  const result = Object.fromEntries(CASES.map((name) => [name, {}])) as Record<
    Case,
    Record<string, string>
  >;
  for (const line of output.split("\n")) {
    const match = /^(\w+)\.(\w+)=(.*)$/.exec(line);
    if (match && match[1] in result) result[match[1] as Case][match[2]] = match[3];
  }
  return result;
}

const SCRIPT = `
set -e
CONFIG=/etc/evcc-addons/config.json
REQ=/var/lib/evcc-addons/update/request.json
SHA=$(sha256sum /pkg/${DEB} | cut -d' ' -f1)

# Dummy-Paket nodejs in Version $1 (ohne Dateien)
dummy_nodejs() {
  rm -rf /tmp/nodejs && mkdir -p /tmp/nodejs/DEBIAN
  printf 'Package: nodejs\\nVersion: %s\\nArchitecture: all\\nMaintainer: Test <test@example.com>\\nDescription: Dummy\\n' "$1" > /tmp/nodejs/DEBIAN/control
  dpkg-deb --build /tmp/nodejs /tmp/nodejs.deb > /dev/null
  dpkg -i --force-depends /tmp/nodejs.deb > /dev/null 2>&1
}

# Release mit Tag v$1 und Prüfsumme $2
release() {
  printf '{"tag_name":"v%s","published_at":"2026-11-12T10:00:00Z","html_url":"http://127.0.0.1:8080/notes","assets":[{"name":"evcc-addons_%s_all.deb","browser_download_url":"http://127.0.0.1:8080/download/evcc-addons_%s_all.deb","digest":"sha256:%s"}]}' "$1" "$1" "$1" "$2" > /tmp/release.json
}

request() {
  printf '{"id":"%s","version":"%s"}' "$1" "$2" > $REQ
}

# Updater für Fall $1 mit eigenem STATE_DIRECTORY
update() {
  set +e
  STATE_DIRECTORY=/tmp/state-$1 node /pkg/package/opt/updater.mjs --config $CONFIG > /tmp/log-$1 2>&1
  echo "$1.exit=$?"
  set -e
  echo "$1.status=$(cat /tmp/state-$1/status.json 2>/dev/null || echo none)"
  if [ -e $REQ ] || [ -L $REQ ]; then echo "$1.request=yes"; else echo "$1.request=no"; fi
  echo "$1.version=$(dpkg-query -W -f='\${Version}' evcc-addons)"
  echo "$1.log=$(tr '\\n' ' ' < /tmp/log-$1)"
}

dummy_nodejs 22.0.0
dpkg -i /legacy/${LEGACY_DEB} > /dev/null
su -s /bin/sh evcc-addons -c "node /opt/evcc-addons/server.mjs install --config $CONFIG /opt/evcc-addons/addons/consumers-1.1.0.zip" > /dev/null
mkdir -p /var/lib/evcc-addons/update

# Eigene Änderung an der Konfiguration; dpkg soll auch ein geändertes Paket-Conffile sehen
node -e '
  const fs = require("fs");
  const config = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  config.releaseUrl = "http://127.0.0.1:8080/releases/latest";
  config.custom = "eigene Änderung";
  fs.writeFileSync(process.argv[1], JSON.stringify(config, null, 2) + "\\n");
' $CONFIG
cp $CONFIG /tmp/config.before
sed -i 's|^ /etc/evcc-addons/config.json [0-9a-f]*$| /etc/evcc-addons/config.json 0123456789abcdef0123456789abcdef|' /var/lib/dpkg/status
grep -q ' /etc/evcc-addons/config.json 0123456789abcdef' /var/lib/dpkg/status

node /test/fake-release.mjs 8080 /tmp/release.json /pkg &
for i in $(seq 1 50); do
  node -e 'fetch("http://127.0.0.1:8080/health").then(() => process.exit(0), () => process.exit(1))' && break
  sleep 0.1
done

cp /etc/shadow /tmp/shadow.before
ln -s /etc/shadow $REQ
update symlink
if cmp -s /etc/shadow /tmp/shadow.before; then echo "symlink.shadow=same"; else echo "symlink.shadow=changed"; fi

release ${VERSION} $SHA
request aaaa0001 9.9.9
update wrongversion

release ${VERSION} 0000000000000000000000000000000000000000000000000000000000000000
request aaaa0002 ${VERSION}
update digest

release ${VERSION} $SHA
dummy_nodejs 18.0.0
request aaaa0003 ${VERSION}
update dependency
dummy_nodejs 22.0.0

request 0123abcd ${VERSION}
update success
if cmp -s $CONFIG /tmp/config.before; then echo "success.config=same"; else echo "success.config=changed"; fi
if [ -d /var/lib/evcc-addons/addons/consumers ]; then echo "success.addon=yes"; else echo "success.addon=no"; fi
`;

describe(`Self-Update ${"1.2.1"} → ${VERSION} (node:22-bookworm-slim)`, () => {
  let result: Record<Case, Record<string, string>>;

  beforeAll(() => {
    buildLegacyDeb();
    result = parseOutput(inContainer(SCRIPT));
  }, BUILD_TIMEOUT_MS);

  it("folgt einem Symlink nicht und liest /etc/shadow nicht", () => {
    expect(result.symlink).toMatchObject({
      exit: "1",
      status: "none",
      request: "no",
      version: "1.2.1",
      shadow: "same",
    });
    expect(result.symlink.log).toContain("ist ein Symlink");
    expect(result.symlink.log).not.toMatch(/root:|daemon:/);
  });

  it("lehnt eine andere Version als releases/latest ab", () => {
    expect(result.wrongversion).toMatchObject({ exit: "1", request: "no", version: "1.2.1" });
    expect(JSON.parse(result.wrongversion.status)).toMatchObject({
      id: "aaaa0001",
      state: "failed",
      message: `Angefordert ist 9.9.9, GitHub bietet ${VERSION} an`,
    });
  });

  it("lehnt eine falsche Prüfsumme ab", () => {
    expect(result.digest).toMatchObject({ exit: "1", version: "1.2.1" });
    const status = JSON.parse(result.digest.status) as { state: string; message: string };
    expect(status.state).toBe("failed");
    expect(status.message).toContain("Prüfsumme");
  });

  it("installiert nicht bei unerfüllter Abhängigkeit", () => {
    expect(result.dependency).toMatchObject({ exit: "1", version: "1.2.1" });
    const status = JSON.parse(result.dependency.status) as { state: string; message: string };
    expect(status.state).toBe("failed");
    expect(status.message).toMatch(/würde weitere Pakete ändern|apt-get install fehlgeschlagen/);
  });

  it("aktualisiert mit Conffile-Konflikt, behält Konfiguration und Addons", () => {
    expect(result.success).toMatchObject({
      exit: "0",
      request: "no",
      version: VERSION,
      config: "same",
      addon: "yes",
    });
    expect(JSON.parse(result.success.status)).toMatchObject({
      id: "0123abcd",
      state: "done",
      version: VERSION,
    });
    expect(result.success.log).toContain(`msg="update installed" version=${VERSION}`);
  });
});
