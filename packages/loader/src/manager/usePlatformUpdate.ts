// Installation einer neuen Plattform-Version: Anforderung, Fortschritt per Polling, Neuladen bei neuer Version
import { useEffect, useRef, useState } from "preact/hooks";
import { ApiError, type ManagerClient, type UpdateStatus } from "../addons-client.js";
import { errorText, isUnauthorized } from "./errors.js";

export type UpdatePhase =
  "idle" | "starting" | "downloading" | "installing" | "restarting" | "failed" | "timeout";

export const POLL_MS = 2000;
export const TIMEOUT_MS = 300_000;

/** Während dieser Phasen sind Schließen und alle Buttons gesperrt */
export function isUpdateBusy(phase: UpdatePhase): boolean {
  return ["starting", "downloading", "installing", "restarting"].includes(phase);
}

export interface PlatformUpdateOptions {
  client: ManagerClient;
  reload: () => void;
  /** Zu installierende Version (latest.version) */
  target: string | null;
  locale: string;
  onUnauthorized: () => void;
}

export interface PlatformUpdate {
  phase: UpdatePhase;
  /** Meldung bei `failed` */
  error: string | null;
  start: () => void;
}

/** Ergebnis einer Abfrage: neue Phase, Neuladen, Fehler oder unverändert */
type PollResult =
  | { kind: "phase"; phase: UpdatePhase }
  | { kind: "reload" }
  | { kind: "failed"; message: string }
  | { kind: "none" };

/** Der Proxy ist während des Neustarts nicht erreichbar oder evcc antwortet mit einem Gateway-Fehler */
function isRestarting(err: unknown): boolean {
  return err instanceof ApiError && [0, 502, 503].includes(err.status);
}

/** Nur der Status mit der eigenen id zählt, ältere Läufe werden ignoriert */
function fromStatus(update: UpdateStatus | null, id: string): PollResult {
  if (update === null || update.id !== id) return { kind: "none" };
  if (update.state === "failed") return { kind: "failed", message: update.message ?? "" };
  if (update.state === "done") return { kind: "phase", phase: "restarting" };
  return { kind: "phase", phase: update.state };
}

async function pollOnce(client: ManagerClient, target: string, id: string, locale: string) {
  try {
    if ((await client.getHealth()).version === target) return { kind: "reload" } as const;
    return fromStatus((await client.getPlatform()).update, id);
  } catch (err) {
    if (isRestarting(err)) return { kind: "phase", phase: "restarting" } as const;
    return { kind: "failed", message: errorText(err, locale) } as const;
  }
}

export function usePlatformUpdate(opts: PlatformUpdateOptions): PlatformUpdate {
  const [phase, setPhase] = useState<UpdatePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const fail = (message: string) => {
    setRunId(null);
    setError(message);
    setPhase("failed");
  };
  useUpdatePolling(opts, runId, { setPhase, setRunId, fail });
  const start = async () => {
    if (opts.target === null) return;
    setPhase("starting");
    setError(null);
    try {
      setRunId((await opts.client.startPlatformUpdate(opts.target)).id);
    } catch (err) {
      if (isUnauthorized(err)) return opts.onUnauthorized();
      fail(errorText(err, opts.locale));
    }
  };
  return { phase, error, start: () => void start() };
}

interface PollingHandlers {
  setPhase: (phase: UpdatePhase) => void;
  setRunId: (id: string | null) => void;
  fail: (message: string) => void;
}

interface Latest {
  opts: PlatformUpdateOptions;
  on: PollingHandlers;
}

/** Fragt alle POLL_MS nach, bis die neue Version läuft, der Lauf scheitert oder TIMEOUT_MS vergeht */
function useUpdatePolling(opts: PlatformUpdateOptions, runId: string | null, on: PollingHandlers) {
  const latest = useRef<Latest>({ opts, on });
  latest.current = { opts, on };
  useEffect(() => {
    if (runId === null) return;
    const poller = createPoller(runId, () => latest.current);
    const timer = setInterval(() => void poller.tick(), POLL_MS);
    return () => {
      poller.stop();
      clearInterval(timer);
    };
  }, [runId]);
}

/** Eine Abfrage zur Zeit; nach stop() werden Ergebnisse verworfen */
function createPoller(runId: string, current: () => Latest) {
  const deadline = Date.now() + TIMEOUT_MS;
  let active = true;
  let busy = false;
  const tick = async () => {
    if (busy || !active) return;
    busy = true;
    try {
      const result = await pollResult(current().opts, runId, deadline);
      if (active) apply(result, current());
    } catch (err) {
      if (active) current().on.fail(errorText(err, current().opts.locale));
    } finally {
      busy = false;
    }
  };
  return { tick, stop: () => void (active = false) };
}

type TickResult = PollResult | { kind: "timeout" };

async function pollResult(opts: PlatformUpdateOptions, id: string, deadline: number) {
  if (Date.now() >= deadline || opts.target === null) return { kind: "timeout" } as TickResult;
  return (await pollOnce(opts.client, opts.target, id, opts.locale)) as TickResult;
}

function apply(
  result: TickResult,
  { opts, on }: { opts: PlatformUpdateOptions; on: PollingHandlers },
) {
  if (result.kind === "phase") return on.setPhase(result.phase);
  if (result.kind === "failed") return on.fail(result.message);
  if (result.kind === "none") return;
  on.setRunId(null);
  if (result.kind === "timeout") return on.setPhase("timeout");
  on.setPhase("restarting");
  opts.reload();
}
