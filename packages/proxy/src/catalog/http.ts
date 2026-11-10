// Ausgehende HTTP-Abrufe des Katalogs mit Timeout und Größenlimit
import { AddonError, type AddonErrorCode } from "../addons/errors.js";
import { fetchErrorMessage } from "../util.js";
import { VERSION } from "../version.js";

export interface FetchOptions {
  timeoutMs: number;
  maxBytes: number;
  /** Code für Netzwerk-, Timeout- und HTTP-Fehler */
  code: AddonErrorCode;
  /** Code bei Überschreitung von `maxBytes`, Standard `code` */
  sizeCode?: AddonErrorCode;
  headers?: Record<string, string>;
  /** Austauschbar für Tests */
  fetch?: typeof fetch;
}

/** Lädt `url` vollständig; Fehler ergeben `AddonError(code)` bzw. `AddonError(sizeCode)` */
export async function fetchBytes(url: string, opts: FetchOptions): Promise<Uint8Array> {
  const res = await request(url, opts);
  return readLimited(res, opts);
}

export async function fetchText(url: string, opts: FetchOptions): Promise<string> {
  return new TextDecoder().decode(await fetchBytes(url, opts));
}

async function request(url: string, opts: FetchOptions): Promise<Response> {
  let res: Response;
  try {
    res = await (opts.fetch ?? fetch)(url, {
      headers: { "user-agent": `evcc-addons/${VERSION}`, ...opts.headers },
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
  } catch (err) {
    throw new AddonError(opts.code, fetchErrorMessage(err, opts.timeoutMs));
  }
  if (res.ok) return res;
  await discard(res, opts);
  throw new AddonError(opts.code, httpProblem(res));
}

/** `HTTP <status>`, beim Abruflimit von GitHub mit Hinweis */
function httpProblem(res: Response): string {
  const limited =
    (res.status === 403 || res.status === 429) && res.headers.get("x-ratelimit-remaining") === "0";
  return `HTTP ${res.status}${limited ? " (Abruflimit von GitHub erreicht)" : ""}`;
}

async function readLimited(res: Response, opts: FetchOptions): Promise<Uint8Array> {
  if (Number(res.headers.get("content-length")) > opts.maxBytes) {
    await discard(res, opts);
    throw tooLarge(opts);
  }
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  try {
    return await readChunks(reader, opts);
  } catch (err) {
    if (err instanceof AddonError) throw err;
    throw new AddonError(opts.code, fetchErrorMessage(err, opts.timeoutMs));
  }
}

async function readChunks(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  opts: FetchOptions,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return Buffer.concat(chunks, size);
    size += value.length;
    if (size > opts.maxBytes) {
      await reader.cancel();
      throw tooLarge(opts);
    }
    chunks.push(value);
  }
}

/** Verwirft einen nicht benötigten Body, damit die Verbindung frei wird */
async function discard(res: Response, opts: FetchOptions): Promise<void> {
  try {
    await res.body?.cancel();
  } catch (err) {
    throw new AddonError(opts.code, fetchErrorMessage(err, opts.timeoutMs));
  }
}

function tooLarge(opts: FetchOptions): AddonError {
  return new AddonError(
    opts.sizeCode ?? opts.code,
    `Antwort ist größer als ${opts.maxBytes} Bytes`,
  );
}
