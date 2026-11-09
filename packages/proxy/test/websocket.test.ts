import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { WS_WELCOME, startFakeEvcc, type FakeEvcc } from "@evcc-addons/sdk/testing/fake-evcc";
import { startTestProxy, type TestProxy } from "./helpers.js";

let evcc: FakeEvcc | undefined;
let proxy: TestProxy | undefined;

afterEach(async () => {
  await proxy?.proxy.stop();
  await evcc?.stop();
  proxy = evcc = undefined;
});

async function setup(rejectUpgrade = false) {
  evcc = await startFakeEvcc({ rejectUpgrade });
  proxy = await startTestProxy(evcc.url);
  return { evcc, proxy };
}

function open(url: string): Promise<{ ws: WebSocket; first: string }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url.replace("http", "ws") + "/ws");
    ws.addEventListener("message", (ev) => resolve({ ws, first: String(ev.data) }), { once: true });
    ws.addEventListener("error", () => reject(new Error("websocket error")), { once: true });
  });
}

function nextMessage(ws: WebSocket): Promise<string> {
  return new Promise((resolve) =>
    ws.addEventListener("message", (ev) => resolve(String(ev.data)), { once: true }),
  );
}

function closed(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) resolve();
    ws.addEventListener("close", () => resolve(), { once: true });
  });
}

describe("WebSocket-Weiterleitung", () => {
  it("überträgt Nachrichten in beide Richtungen", async () => {
    const { proxy } = await setup();
    const { ws, first } = await open(proxy.url);
    expect(first).toBe(WS_WELCOME);
    ws.send('{"ping":1}');
    expect(await nextMessage(ws)).toBe('{"ping":1}');
    ws.close();
  });

  it("schließt den Client, wenn evcc die Verbindung trennt", async () => {
    const { proxy, evcc } = await setup();
    const { ws } = await open(proxy.url);
    for (const socket of evcc.sockets) socket.destroy();
    await closed(ws);
  });

  it("schließt evcc-seitig, wenn der Client trennt", async () => {
    const { proxy, evcc } = await setup();
    const { ws } = await open(proxy.url);
    expect(evcc.sockets.size).toBe(1);
    ws.close();
    await expect.poll(() => evcc.sockets.size).toBe(0);
  });

  it("gibt eine Ablehnung (400) weiter und schließt den Socket", async () => {
    const { proxy } = await setup(true);
    const response = await new Promise<string>((resolve, reject) => {
      const socket = net.connect(proxy.port, "127.0.0.1", () =>
        socket.write(
          "GET /ws HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n" +
            "Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n",
        ),
      );
      let data = "";
      socket.on("data", (chunk) => (data += chunk.toString()));
      socket.on("close", () => resolve(data));
      socket.on("error", reject);
    });
    expect(response).toMatch(/^HTTP\/1\.1 400/);
    expect(response).toContain("bad request");
  });

  it("fährt mit offener Verbindung in unter 5 s herunter", async () => {
    const { proxy } = await setup();
    const { ws } = await open(proxy.url);
    const start = Date.now();
    await proxy.proxy.stop();
    await closed(ws);
    expect(Date.now() - start).toBeLessThan(5000);
  });
});
