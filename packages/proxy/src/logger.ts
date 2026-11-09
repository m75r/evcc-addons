// logfmt-Logger: info/debug nach stdout, warn/error nach stderr (systemd übernimmt beides ins Journal)
import type { LogLevel } from "./config.js";

export type LogFields = Record<string, string | number | boolean | null | undefined>;

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  readonly isDebug: boolean;
  /** Logger, der `fields` jeder Zeile voranstellt, z. B. `{ addon: "x" }` */
  child(fields: LogFields): Logger;
}

export interface LogSink {
  out(line: string): void;
  err(line: string): void;
}

const processSink: LogSink = {
  out: (line) => void process.stdout.write(line + "\n"),
  err: (line) => void process.stderr.write(line + "\n"),
};

export function createLogger(level: LogLevel, sink: LogSink = processSink): Logger {
  return buildLogger(level === "debug", sink, {});
}

function buildLogger(isDebug: boolean, sink: LogSink, base: LogFields): Logger {
  const write = (target: "out" | "err", lvl: string, msg: string, fields?: LogFields) =>
    sink[target](formatLine(lvl, msg, { ...base, ...fields }));
  return {
    isDebug,
    debug: (msg, fields) => isDebug && write("out", "debug", msg, fields),
    info: (msg, fields) => write("out", "info", msg, fields),
    warn: (msg, fields) => write("err", "warn", msg, fields),
    error: (msg, fields) => write("err", "error", msg, fields),
    child: (fields) => buildLogger(isDebug, sink, { ...base, ...fields }),
  };
}

export function formatLine(level: string, msg: string, fields: LogFields = {}): string {
  const parts = [`level=${level}`, `msg=${escapeValue(msg)}`];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    parts.push(`${key}=${escapeValue(String(value))}`);
  }
  return parts.join(" ");
}

/** Werte mit Leerzeichen, Anführungszeichen oder `=` werden in Anführungszeichen gesetzt */
export function escapeValue(value: string): string {
  if (value !== "" && !/[\s"=\\]/.test(value)) return value;
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
  return `"${escaped}"`;
}

/** Logger ohne Ausgabe, z. B. für Tests */
export function silentLogger(): Logger {
  return createLogger("debug", { out: () => undefined, err: () => undefined });
}
