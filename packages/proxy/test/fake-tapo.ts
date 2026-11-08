// Simulierte Tapo-Steckdose mit KLAP (für Unit-, Integrations- und E2E-Tests)
import { randomBytes } from "node:crypto";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import {
  clientHash,
  decryptPayload,
  deriveKeys,
  encryptPayload,
  parseTapoCookies,
  serverHash,
  userHash,
  type KlapKeys,
} from "../src/switches/tapo/klap.js";

export const TAPO_USER = "ich@example.com";
export const TAPO_PASSWORD = "tapo-secret";

export interface FakeTapoState {
  on: boolean;
  /** Leistung in W */
  power: number;
  hasMeter: boolean;
  /** Antwortet gar nicht (für Timeouts) */
  hang: boolean;
  /** Antwortet auf handshake1 mit diesem Status */
  handshakeStatus: number;
}

export interface CommandEntry {
  on: boolean;
  at: number;
}

export interface FakeTapo {
  url: string;
  host: string;
  port: number;
  state: FakeTapoState;
  /** Alle set_device_info in der Reihenfolge des Eingangs */
  commands: CommandEntry[];
  /** Methoden aller entschlüsselten Anfragen */
  methods: string[];
  handshakes: number;
  /** Schaltung am Gerät (Taster) */
  press(on: boolean): void;
  /** Alle Sitzungen verwerfen: nächste Anfrage ergibt 403 */
  expireSessions(): void;
  reset(): void;
  stop(): Promise<void>;
}

interface Session {
  localSeed: Buffer;
  remoteSeed: Buffer;
  keys: KlapKeys;
  established: boolean;
}

const DEFAULT_STATE: FakeTapoState = {
  on: false,
  power: 35,
  hasMeter: true,
  hang: false,
  handshakeStatus: 200,
};

export async function startFakeTapo(
  initial: Partial<FakeTapoState> = {},
  port = 0,
  host = "127.0.0.1",
): Promise<FakeTapo> {
  const sessions = new Map<string, Session>();
  const hash = userHash(TAPO_USER, TAPO_PASSWORD);
  const fake = createFake({ ...DEFAULT_STATE, ...initial }, sessions);
  const server = http.createServer((req, res) => void handle(req, res, fake, sessions, hash));
  await new Promise<void>((resolve) => server.listen(port, host, resolve));
  const address = server.address() as AddressInfo;
  fake.port = address.port;
  fake.host = `${host}:${address.port}`;
  fake.url = `http://${fake.host}`;
  fake.stop = () =>
    new Promise((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  return fake;
}

function createFake(state: FakeTapoState, sessions: Map<string, Session>): FakeTapo {
  const initial = { ...state };
  const fake: FakeTapo = {
    url: "",
    host: "",
    port: 0,
    state,
    commands: [],
    methods: [],
    handshakes: 0,
    press: (on) => void (state.on = on),
    expireSessions: () => sessions.clear(),
    reset: () => {
      Object.assign(state, initial);
      fake.commands.length = 0;
      fake.methods.length = 0;
      sessions.clear();
    },
    stop: () => Promise.resolve(),
  };
  return fake;
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  fake: FakeTapo,
  sessions: Map<string, Session>,
  hash: Buffer,
) {
  const url = new URL(req.url ?? "/", "http://fake");
  const body = await readBody(req);
  if (url.pathname.startsWith("/_test/")) return control(url, req.method, res, fake);
  if (fake.state.hang) return;
  if (url.pathname === "/app/handshake1") return handshake1(body, res, fake, sessions, hash);
  const session = sessions.get(sessionIdOf(req) ?? "");
  if (!session) return void res.writeHead(403).end();
  if (url.pathname === "/app/handshake2") return handshake2(body, res, session, hash);
  if (url.pathname === "/app/request" && session.established) {
    return request(Number(url.searchParams.get("seq")), body, res, fake, session);
  }
  res.writeHead(403).end();
}

function sessionIdOf(req: IncomingMessage): string | undefined {
  return parseTapoCookies([req.headers.cookie ?? ""]).get("TP_SESSIONID");
}

/** Antwortet mit dem eigenen Hash; falsche Zugangsdaten erkennt der Client am Vergleich */
function handshake1(
  localSeed: Buffer,
  res: ServerResponse,
  fake: FakeTapo,
  sessions: Map<string, Session>,
  hash: Buffer,
) {
  fake.handshakes++;
  if (fake.state.handshakeStatus !== 200)
    return void res.writeHead(fake.state.handshakeStatus).end();
  const remoteSeed = randomBytes(16);
  const id = randomBytes(8).toString("hex");
  const keys = deriveKeys(localSeed, remoteSeed, hash);
  sessions.set(id, { localSeed, remoteSeed, keys, established: false });
  res.writeHead(200, { "set-cookie": `TP_SESSIONID=${id};TIMEOUT=86400` });
  res.end(Buffer.concat([remoteSeed, serverHash(localSeed, remoteSeed, hash)]));
}

function handshake2(body: Buffer, res: ServerResponse, session: Session, hash: Buffer) {
  if (!body.equals(clientHash(session.localSeed, session.remoteSeed, hash))) {
    return void res.writeHead(403).end();
  }
  session.established = true;
  res.writeHead(200).end();
}

function request(seq: number, body: Buffer, res: ServerResponse, fake: FakeTapo, session: Session) {
  const payload = JSON.parse(decryptPayload(session.keys, seq, body).toString("utf8")) as {
    method: string;
    params?: { device_on?: boolean };
  };
  fake.methods.push(payload.method);
  const answer = execute(payload, fake);
  res.writeHead(200).end(encryptPayload(session.keys, seq, Buffer.from(JSON.stringify(answer))));
}

function execute(payload: { method: string; params?: { device_on?: boolean } }, fake: FakeTapo) {
  const { state } = fake;
  switch (payload.method) {
    case "get_device_info":
      return { error_code: 0, result: { device_on: state.on, model: "P110" } };
    case "get_energy_usage":
      if (!state.hasMeter) return { error_code: -1001 };
      return { error_code: 0, result: { current_power: state.on ? state.power * 1000 : 0 } };
    case "set_device_info":
      state.on = payload.params?.device_on === true;
      fake.commands.push({ on: state.on, at: Date.now() });
      return { error_code: 0 };
    default:
      return { error_code: -1 };
  }
}

/** Steuerung für E2E: press, commands, reset, state */
function control(url: URL, method: string | undefined, res: ServerResponse, fake: FakeTapo) {
  const json = (value: unknown) =>
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(value));
  if (method === "POST" && url.pathname === "/_test/press") {
    fake.press(url.searchParams.get("on") === "true");
    return json({ on: fake.state.on, at: Date.now() });
  }
  if (method === "POST" && url.pathname === "/_test/reset") {
    fake.reset();
    return json({});
  }
  if (url.pathname === "/_test/commands") return json(fake.commands);
  if (url.pathname === "/_test/state") return json(fake.state);
  res.writeHead(404).end();
}
