// Geteilter Live-Zustand aus dem evcc-WebSocket (/ws), Merge wie in evcc store.ts

export type ErrorHandler = (err: unknown) => void;

export interface SharedLiveState {
  get(key?: string): unknown;
  subscribe(prefix: string, cb: (value: unknown) => void, onError?: ErrorHandler): () => void;
  dispose(): void;
}

export interface LiveStateOptions {
  url?: () => string;
  WebSocketImpl?: typeof WebSocket;
}

type State = Record<string, unknown>;

interface Subscription {
  prefix: string;
  cb: (value: unknown) => void;
  onError?: ErrorHandler;
}

const FIRST_RETRY_MS = 250;
const RETRY_MS = 2500;

/** WebSocket-URL wie evcc (App.vue): relativ zur aktuellen Seite */
export function websocketUrl(): string {
  const url = new URL("ws", window.location.href);
  url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return url.href;
}

/** Überträgt einen Punkt-Schlüssel in den Zustand (Port von evcc setProperty) */
export function setProperty(obj: State, props: string[], value: unknown): void {
  const prop = props.shift() as string;
  if (!obj[prop]) obj[prop] = {};
  if (props.length === 0) {
    const isPlainObject = value && typeof value === "object" && !Array.isArray(value);
    obj[prop] = isPlainObject ? { ...(obj[prop] as State), ...(value as State) } : value;
    return;
  }
  setProperty(obj[prop] as State, props, value);
}

export function getPath(obj: unknown, key?: string): unknown {
  if (!key) return obj;
  let current: unknown = obj;
  for (const part of key.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as State)[part];
  }
  return current;
}

/** Schlüssel betrifft das Abo, wenn er gleich, darunter oder ein Elternteil ist */
export function affects(key: string, prefix: string): boolean {
  return key === prefix || key.startsWith(prefix + ".") || prefix.startsWith(key + ".");
}

export function createLiveState(opts: LiveStateOptions = {}): SharedLiveState {
  return new LiveStateClient(opts.url ?? websocketUrl, opts.WebSocketImpl ?? WebSocket);
}

class LiveStateClient implements SharedLiveState {
  private state: State = { loadpoints: [] };
  private received = false;
  private ws: WebSocket | undefined;
  private attempts = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  private readonly subs = new Set<Subscription>();

  constructor(
    private readonly url: () => string,
    private readonly WebSocketImpl: typeof WebSocket,
  ) {}

  get(key?: string): unknown {
    this.connect();
    return getPath(this.state, key);
  }

  subscribe(prefix: string, cb: (value: unknown) => void, onError?: ErrorHandler): () => void {
    const sub: Subscription = { prefix, cb, onError };
    this.subs.add(sub);
    this.connect();
    if (this.received && getPath(this.state, prefix) !== undefined) this.notify(sub);
    return () => this.subs.delete(sub);
  }

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.retryTimer);
    this.ws?.close();
    this.ws = undefined;
    this.subs.clear();
  }

  private connect(): void {
    if (this.ws || this.disposed) return;
    const ws = new this.WebSocketImpl(this.url());
    this.ws = ws;
    ws.onmessage = (event: MessageEvent) => this.handleMessage(event.data);
    ws.onerror = () => ws.close();
    ws.onclose = () => this.scheduleReconnect(ws);
  }

  private scheduleReconnect(ws: WebSocket): void {
    if (this.ws !== ws || this.disposed) return;
    this.ws = undefined;
    const delay = this.attempts === 0 ? FIRST_RETRY_MS : RETRY_MS;
    this.attempts++;
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }

  private handleMessage(data: unknown): void {
    let msg: State;
    try {
      msg = JSON.parse(String(data)) as State;
    } catch (err) {
      this.broadcastError(new Error(`Ungültige WebSocket-Daten: ${(err as Error).message}`));
      return;
    }
    if (msg.startupCompleted) this.state = { loadpoints: [] };
    const keys = Object.keys(msg);
    for (const key of keys) setProperty(this.state, key.split("."), msg[key]);
    this.received = true;
    this.attempts = 0;
    for (const sub of this.subs) {
      if (keys.some((key) => affects(key, sub.prefix))) this.notify(sub);
    }
  }

  /** Fehler eines Callbacks werden isoliert und dem jeweiligen Addon gemeldet */
  private notify(sub: Subscription): void {
    try {
      sub.cb(getPath(this.state, sub.prefix));
    } catch (err) {
      sub.onError?.(err);
    }
  }

  private broadcastError(err: Error): void {
    for (const sub of this.subs) sub.onError?.(err);
  }
}
