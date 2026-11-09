import { describe, expect, it } from "vitest";
import {
  decryptPayload,
  deriveKeys,
  encryptPayload,
  nextSeq,
  parseTapoCookies,
  userHash,
} from "../../src/server/tapo/klap.js";

/*
 * Testvektoren aus github.com/insomniacslk/tapo v1.1.0 (klap_protocol.go), berechnet mit
 * Go 1.23 über einen Test im Paket `tapo`:
 *   user = "ich@example.com", password = "tapo-secret"
 *   localSeed = 00 01 … 0f, remoteSeed = f0 f1 … ff
 *   s.LocalSeed, s.RemoteSeed, s.UserHash = …; getKey(), getSignature(), getIV()
 *   s.encrypt([]byte(`{"method":"get_device_info"}`)) → seq, Chiffrat
 */
const USER_HASH = "9acc6107eba8757df5588df6fa9081cb8ea04ed503d1dc197cbf17674b2675aa";
const KEY = "fbdfdfefa416f124cf009784779b241b";
const SIG = "7d897c26ff1e8aaf0ff6fc9cdcf7a89557f3b7abdd88198cb2fe67cc";
const IV = "c23e0e4f4f4815dd80f3e2773eee3743";
const FIRST_SEQ = 1055799108;
const ENCRYPTED =
  "a412615641d31af1929a1e7b5c7ed61ff75ae1df7618af7adb531b7d6aa693fc" +
  "fec39760053b4c5fa2854446a35594883fda4d9e7552cb940d411eb5a61f9947";
const PLAINTEXT = '{"method":"get_device_info"}';

const localSeed = Buffer.from(Array.from({ length: 16 }, (_, i) => i));
const remoteSeed = Buffer.from(Array.from({ length: 16 }, (_, i) => 0xf0 + i));

function keys() {
  return deriveKeys(localSeed, remoteSeed, userHash("ich@example.com", "tapo-secret"));
}

describe("KLAP-Ableitungen", () => {
  it("berechnet userHash, Schlüssel, Signatur und IV wie die Go-Implementierung", () => {
    expect(userHash("ich@example.com", "tapo-secret").toString("hex")).toBe(USER_HASH);
    const derived = keys();
    expect(derived.key.toString("hex")).toBe(KEY);
    expect(derived.sig.toString("hex")).toBe(SIG);
    expect(derived.ivPrefix.toString("hex")).toBe(IV.slice(0, 24));
    expect(nextSeq(derived.initialSeq)).toBe(FIRST_SEQ);
  });

  it("verschlüsselt die erste Anfrage byte-gleich", () => {
    const encrypted = encryptPayload(keys(), FIRST_SEQ, Buffer.from(PLAINTEXT));
    expect(encrypted.toString("hex")).toBe(ENCRYPTED);
  });

  it("entschlüsselt im Kreis, auch bei Länge auf Blockgrenze", () => {
    for (const text of [PLAINTEXT, "x".repeat(32), ""]) {
      const encrypted = encryptPayload(keys(), 7, Buffer.from(text));
      expect(decryptPayload(keys(), 7, encrypted).toString()).toBe(text);
    }
  });

  it("läuft bei int32 über", () => {
    expect(nextSeq(2147483647)).toBe(-2147483648);
    expect(nextSeq(-1)).toBe(0);
  });

  it("parst die fehlerhaften Tapo-Cookies", () => {
    const cookies = parseTapoCookies(["TP_SESSIONID=ABC123;TIMEOUT=86400"]);
    expect(cookies.get("TP_SESSIONID")).toBe("ABC123");
    expect(cookies.get("TIMEOUT")).toBe("86400");
  });
});
