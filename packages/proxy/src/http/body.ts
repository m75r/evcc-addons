// Lesen des Anfrage-Bodys mit Größenlimit
import type { IncomingMessage } from "node:http";
import { AddonError } from "../addons/errors.js";

/** Liest den Body; zu große Anfragen werden ohne vollständiges Puffern abgelehnt */
export function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const declared = Number(req.headers["content-length"] ?? NaN);
  if (declared > limit) return Promise.reject(tooLarge(limit));
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const onData = (chunk: Buffer) => {
      size += chunk.length;
      if (size <= limit) return void chunks.push(chunk);
      req.off("data", onData);
      req.pause();
      reject(tooLarge(limit));
    };
    req.on("data", onData);
    req.once("end", () => resolve(Buffer.concat(chunks)));
    req.once("error", (err) =>
      reject(new Error(`Upload abgebrochen: ${err.message}`, { cause: err })),
    );
  });
}

export async function readJsonBody(req: IncomingMessage, limit: number): Promise<unknown> {
  const body = await readBody(req, limit);
  try {
    return JSON.parse(body.toString("utf8"));
  } catch (err) {
    throw new AddonError("body-invalid", `Ungültiges JSON: ${(err as Error).message}`);
  }
}

function tooLarge(limit: number): AddonError {
  return new AddonError("too-large", `Anfrage ist größer als ${limit} Bytes`);
}
