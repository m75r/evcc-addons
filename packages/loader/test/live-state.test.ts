import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLiveState, type SharedLiveState } from "../src/live-state.js";

/** Minimaler WebSocket-Ersatz, der Instanzen für den Test sammelt */
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.onclose?.();
  }

  emit(msg: unknown): void {
    this.onmessage?.({ data: JSON.stringify(msg) } as MessageEvent);
  }
}

let live: SharedLiveState;
const socket = (i = 0) => MockWebSocket.instances[i];

beforeEach(() => {
  MockWebSocket.instances = [];
  live = createLiveState({
    url: () => "ws://pi/ws",
    WebSocketImpl: MockWebSocket as unknown as typeof WebSocket,
  });
});

afterEach(() => {
  live.dispose();
  vi.useRealTimers();
});

describe("LiveState", () => {
  it("verbindet erst beim ersten Zugriff", () => {
    expect(MockWebSocket.instances).toHaveLength(0);
    live.get("pvPower");
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(socket().url).toBe("ws://pi/ws");
  });

  it("mergt Punkt-Schlüssel wie evcc", () => {
    live.get();
    socket().emit({ loadpoints: [{ title: "Carport", chargePower: 0 }], pvPower: 100 });
    socket().emit({ "loadpoints.0.chargePower": 150, "loadpoints.1.title": "Waschmaschine" });
    expect(live.get("loadpoints.0")).toEqual({ title: "Carport", chargePower: 150 });
    expect(live.get("loadpoints.1.title")).toBe("Waschmaschine");
    socket().emit({ site: { a: 1 } });
    socket().emit({ site: { b: 2 } });
    expect(live.get("site")).toEqual({ a: 1, b: 2 });
  });

  it("meldet Änderungen unter dem Präfix und von Elternschlüsseln", () => {
    const cb = vi.fn();
    live.subscribe("loadpoints.0", cb);
    socket().emit({ "loadpoints.0.chargePower": 150 });
    socket().emit({ "loadpoints.1.chargePower": 99 });
    socket().emit({ loadpoints: [{ chargePower: 1 }] });
    socket().emit({ pvPower: 1 });
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenLastCalledWith({ chargePower: 1 });
  });

  it("feuert sofort, wenn schon Daten vorliegen", () => {
    live.get();
    socket().emit({ pvPower: 4321 });
    const cb = vi.fn();
    live.subscribe("pvPower", cb);
    expect(cb).toHaveBeenCalledWith(4321);
  });

  it("setzt den Zustand bei startupCompleted zurück", () => {
    live.get();
    socket().emit({ pvPower: 1, loadpoints: [{ title: "alt" }] });
    socket().emit({ startupCompleted: true, gridPower: 5 });
    expect(live.get()).toEqual({ loadpoints: [], startupCompleted: true, gridPower: 5 });
  });

  it("verbindet nach 250 ms und danach alle 2500 ms neu", () => {
    vi.useFakeTimers();
    live.get();
    socket(0).close();
    vi.advanceTimersByTime(249);
    expect(MockWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(2);
    socket(1).close();
    vi.advanceTimersByTime(2499);
    expect(MockWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(3);
    socket(2).emit({ pvPower: 1 });
    socket(2).close();
    vi.advanceTimersByTime(250);
    expect(MockWebSocket.instances).toHaveLength(4);
  });

  it("isoliert fehlerhafte Callbacks", () => {
    const onError = vi.fn();
    const good = vi.fn();
    live.subscribe(
      "pvPower",
      () => {
        throw new Error("Addon kaputt");
      },
      onError,
    );
    live.subscribe("pvPower", good);
    socket().emit({ pvPower: 1 });
    expect(good).toHaveBeenCalledWith(1);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "Addon kaputt" }));
  });

  it("meldet sich wieder ab", () => {
    const cb = vi.fn();
    const off = live.subscribe("pvPower", cb);
    off();
    socket().emit({ pvPower: 1 });
    expect(cb).not.toHaveBeenCalled();
  });
});
