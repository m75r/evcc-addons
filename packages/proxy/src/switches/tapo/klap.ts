// KLAP-Protokoll der Tapo-Firmware; Portierung von klap_protocol.go aus
// github.com/insomniacslk/tapo v1.1.0 (MIT, Copyright (c) 2023 Andrea Barberio)
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { errorMessage, isRecord } from "../../util.js";
import { postBinary, type PostResult } from "./http.js";

export interface KlapKeys {
  key: Buffer;
  sig: Buffer;
  /** Erste 12 Byte der IV, die letzten 4 sind die Sequenznummer */
  ivPrefix: Buffer;
  initialSeq: number;
}

/** network: keine Verbindung/Timeout, forbidden: HTTP 403, protocol: alles andere */
export type KlapErrorKind = "network" | "forbidden" | "protocol";

export class KlapError extends Error {
  override name = "KlapError";

  constructor(
    readonly kind: KlapErrorKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

function sha256(...parts: Buffer[]): Buffer {
  return createHash("sha256").update(Buffer.concat(parts)).digest();
}

function sha1(text: string): Buffer {
  return createHash("sha1").update(text, "utf8").digest();
}

/** userHash = sha256(sha1(user) ‖ sha1(password)) */
export function userHash(user: string, password: string): Buffer {
  return sha256(sha1(user), sha1(password));
}

/** Erwarteter Server-Hash aus handshake1: sha256(localSeed ‖ remoteSeed ‖ userHash) */
export function serverHash(localSeed: Buffer, remoteSeed: Buffer, hash: Buffer): Buffer {
  return sha256(localSeed, remoteSeed, hash);
}

/** Body von handshake2: sha256(remoteSeed ‖ localSeed ‖ userHash) */
export function clientHash(localSeed: Buffer, remoteSeed: Buffer, hash: Buffer): Buffer {
  return sha256(remoteSeed, localSeed, hash);
}

export function deriveKeys(localSeed: Buffer, remoteSeed: Buffer, hash: Buffer): KlapKeys {
  const secret = Buffer.concat([localSeed, remoteSeed, hash]);
  const ivHash = sha256(Buffer.from("iv"), secret);
  return {
    key: sha256(Buffer.from("lsk"), secret).subarray(0, 16),
    sig: sha256(Buffer.from("ldk"), secret).subarray(0, 28),
    ivPrefix: ivHash.subarray(0, 12),
    initialSeq: ivHash.readInt32BE(28),
  };
}

/** Nächste Sequenznummer als int32 mit Überlauf (wie in Go) */
export function nextSeq(seq: number): number {
  return (seq + 1) | 0;
}

function int32Bytes(value: number): Buffer {
  const bytes = Buffer.alloc(4);
  bytes.writeInt32BE(value);
  return bytes;
}

function ivFor(keys: KlapKeys, seq: number): Buffer {
  return Buffer.concat([keys.ivPrefix, int32Bytes(seq)]);
}

/** AES-128-CBC mit PKCS7; Ergebnis = sha256(sig ‖ seq ‖ Chiffrat) ‖ Chiffrat */
export function encryptPayload(keys: KlapKeys, seq: number, plaintext: Buffer): Buffer {
  const cipher = createCipheriv("aes-128-cbc", keys.key, ivFor(keys, seq));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([sha256(keys.sig, int32Bytes(seq), ciphertext), ciphertext]);
}

/** Entschlüsselt Signatur(32) ‖ Chiffrat mit der IV derselben Sequenznummer */
export function decryptPayload(keys: KlapKeys, seq: number, data: Buffer): Buffer {
  if (data.length < 48) throw new Error(`Antwort zu kurz (${data.length} Byte)`);
  const decipher = createDecipheriv("aes-128-cbc", keys.key, ivFor(keys, seq));
  return Buffer.concat([decipher.update(data.subarray(32)), decipher.final()]);
}

/** Tapo setzt fehlerhafte Cookies (`TP_SESSIONID=…;TIMEOUT=86400`), daher eigenes Parsen */
export function parseTapoCookies(lines: string[]): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of lines.flatMap((line) => line.split(";"))) {
    const index = part.indexOf("=");
    if (index > 0) cookies.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
  }
  return cookies;
}

export interface KlapOptions {
  host: string;
  user: string;
  password: string;
  timeoutMs: number;
  now?: () => number;
}

/** Netzfehler und Timeouts werden zu KlapError("network") */
async function post(
  opts: KlapOptions,
  path: string,
  body: Buffer,
  cookie?: string,
): Promise<PostResult> {
  try {
    return await postBinary(`http://${opts.host}${path}`, body, cookie, opts.timeoutMs);
  } catch (err) {
    throw new KlapError("network", errorMessage(err), { cause: err });
  }
}

const DEFAULT_TIMEOUT_S = 86400;

export class KlapSession {
  private seq: number;

  private constructor(
    private readonly opts: KlapOptions,
    private readonly keys: KlapKeys,
    private readonly cookie: string,
    private readonly expiresAt: number,
  ) {
    this.seq = keys.initialSeq;
  }

  /** handshake1 und handshake2; Fehler sind KlapError */
  static async open(opts: KlapOptions): Promise<KlapSession> {
    const now = opts.now ?? Date.now;
    const localSeed = randomBytes(16);
    const hash = userHash(opts.user, opts.password);
    const first = await handshake1(opts, localSeed, hash);
    await handshake2(opts, clientHash(localSeed, first.remoteSeed, hash), first.cookie);
    const keys = deriveKeys(localSeed, first.remoteSeed, hash);
    return new KlapSession(opts, keys, first.cookie, now() + first.timeoutS * 1000);
  }

  get expired(): boolean {
    return (this.opts.now ?? Date.now)() >= this.expiresAt;
  }

  /** Verschlüsselte Anfrage an /app/request; liefert die entschlüsselte JSON-Antwort */
  async request(payload: unknown): Promise<Record<string, unknown>> {
    this.seq = nextSeq(this.seq);
    const seq = this.seq;
    const body = encryptPayload(this.keys, seq, Buffer.from(JSON.stringify(payload)));
    const res = await post(this.opts, `/app/request?seq=${seq}`, body, this.cookie);
    if (res.status === 403) throw new KlapError("forbidden", "Sitzung abgelehnt (HTTP 403)");
    if (res.status !== 200) throw new KlapError("protocol", `Anfrage: HTTP ${res.status}`);
    return this.decode(seq, res.body);
  }

  private decode(seq: number, data: Buffer): Record<string, unknown> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(decryptPayload(this.keys, seq, data).toString("utf8"));
    } catch (err) {
      throw new KlapError("protocol", `Antwort nicht lesbar: ${errorMessage(err)}`, { cause: err });
    }
    if (!isRecord(parsed)) throw new KlapError("protocol", "Antwort ist kein JSON-Objekt");
    return parsed;
  }
}

interface Handshake1Result {
  remoteSeed: Buffer;
  cookie: string;
  timeoutS: number;
}

async function handshake1(
  opts: KlapOptions,
  localSeed: Buffer,
  hash: Buffer,
): Promise<Handshake1Result> {
  const res = await post(opts, "/app/handshake1", localSeed);
  if (res.status !== 200) throw new KlapError("protocol", `handshake1: HTTP ${res.status}`);
  if (res.body.length !== 48) {
    throw new KlapError("protocol", `handshake1: unerwartete Antwort (${res.body.length} Byte)`);
  }
  const remoteSeed = res.body.subarray(0, 16);
  if (!timingSafeEqual(res.body.subarray(16), serverHash(localSeed, remoteSeed, hash))) {
    throw new KlapError("protocol", "handshake1: Anmeldung abgelehnt (Tapo-E-Mail oder Passwort?)");
  }
  const cookies = parseTapoCookies(res.setCookie);
  const sessionId = cookies.get("TP_SESSIONID");
  if (!sessionId) throw new KlapError("protocol", "handshake1: Cookie TP_SESSIONID fehlt");
  return { remoteSeed, cookie: `TP_SESSIONID=${sessionId}`, timeoutS: timeoutOf(cookies) };
}

function timeoutOf(cookies: Map<string, string>): number {
  const timeoutS = Number(cookies.get("TIMEOUT") ?? DEFAULT_TIMEOUT_S);
  return Number.isFinite(timeoutS) && timeoutS > 0 ? timeoutS : DEFAULT_TIMEOUT_S;
}

async function handshake2(opts: KlapOptions, payload: Buffer, cookie: string): Promise<void> {
  const res = await post(opts, "/app/handshake2", payload, cookie);
  if (res.status !== 200) throw new KlapError("protocol", `handshake2: HTTP ${res.status}`);
}
