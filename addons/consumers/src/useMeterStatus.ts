// Fragt die Gerätewerte nacheinander ab (wie evcc), solange die Seite sichtbar ist
import type { AddonApi } from "@evcc-addons/sdk";
import { useEffect, useState } from "preact/hooks";
import { fetchMeterStatus, pollIntervalMs, type MeterStatus } from "./meter-status.js";

export type StatusAuth = "unknown" | "ok" | "unauthorized";

export interface MeterStatusState {
  statuses: Record<string, MeterStatus>;
  auth: StatusAuth;
  /** Netzwerk- oder Serverfehler der letzten Runde */
  error: string | null;
}

const INITIAL: MeterStatusState = { statuses: {}, auth: "unknown", error: null };

interface Round {
  statuses: Record<string, MeterStatus>;
  auth: StatusAuth;
}

/** Eine Abfragerunde; ohne Login wird nach der ersten Antwort abgebrochen */
async function pollRound(api: AddonApi, names: string[]): Promise<Round> {
  const statuses: Record<string, MeterStatus> = {};
  for (const name of names) {
    const result = await fetchMeterStatus(api, name);
    if (result.kind === "unauthorized") return { statuses: {}, auth: "unauthorized" };
    if (result.kind === "ok") statuses[name] = result.status;
  }
  return { statuses, auth: "ok" };
}

type Update = (next: (prev: MeterStatusState) => MeterStatusState) => void;

/** Startet die Abfrageschleife, gibt die Stopp-Funktion zurück */
function startPolling(api: AddonApi, names: string[], update: Update): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = async () => {
    if (document.visibilityState !== "hidden") {
      try {
        const round = await pollRound(api, names);
        if (!stopped) update(() => ({ ...round, error: null }));
      } catch (err) {
        if (!stopped) update((prev) => ({ ...prev, error: (err as Error).message }));
      }
    }
    if (!stopped) timer = setTimeout(() => void run(), pollIntervalMs(api));
  };
  void run();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

export function useMeterStatus(api: AddonApi, names: string[]): MeterStatusState {
  const [state, setState] = useState<MeterStatusState>(INITIAL);
  // Neu starten nur, wenn sich die Meter-Namen ändern
  const key = names.join("\n");
  useEffect(() => {
    if (key === "") return undefined;
    return startPolling(api, key.split("\n"), setState);
  }, [api, key]);
  return state;
}
