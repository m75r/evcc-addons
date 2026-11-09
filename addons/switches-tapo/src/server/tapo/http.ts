// HTTP-POST an die Tapo-Firmware. Sie erkennt Header nur in üblicher Schreibweise
// (`Content-Length`, nicht `content-length`) und antwortet sonst mit 400. fetch (undici) sendet
// Header-Namen immer klein, node:http übernimmt die Schreibweise wie angegeben.
import http, { type IncomingMessage } from "node:http";

export interface PostResult {
  status: number;
  body: Buffer;
  setCookie: string[];
}

/** POST ohne Keep-Alive; Netzfehler und Timeout ergeben einen Error mit verständlicher Meldung */
export function postBinary(
  url: string,
  body: Buffer,
  cookie: string | undefined,
  timeoutMs: number,
): Promise<PostResult> {
  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method: "POST",
      headers: headersFor(body, cookie),
      agent: false,
    });
    const timer = setTimeout(
      () => req.destroy(new Error(`keine Antwort innerhalb von ${timeoutMs / 1000} s`)),
      timeoutMs,
    );
    const fail = (err: Error) => {
      clearTimeout(timer);
      reject(err);
    };
    req.on("error", fail);
    req.on(
      "response",
      (res) =>
        void readAll(res).then((data) => {
          clearTimeout(timer);
          resolve(toResult(res, data));
        }, fail),
    );
    req.end(body);
  });
}

function toResult(res: IncomingMessage, body: Buffer): PostResult {
  return { status: res.statusCode ?? 0, body, setCookie: res.headers["set-cookie"] ?? [] };
}

function headersFor(body: Buffer, cookie: string | undefined): http.OutgoingHttpHeaders {
  return {
    "Content-Type": "application/octet-stream",
    "Content-Length": body.length,
    ...(cookie ? { Cookie: cookie } : {}),
    Connection: "close",
  };
}

function readAll(res: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    res.on("data", (chunk: Buffer) => chunks.push(chunk));
    res.once("end", () => resolve(Buffer.concat(chunks)));
    res.once("error", reject);
  });
}
