// HTTP-Anfragen ohne automatische Dekompression (für Header- und Encoding-Prüfungen)
import http, { type IncomingHttpHeaders } from "node:http";

export interface RawResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

export function rawRequest(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string | Buffer } = {},
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      { method: init.method ?? "GET", headers: init.headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          }),
        );
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.end(init.body);
  });
}
