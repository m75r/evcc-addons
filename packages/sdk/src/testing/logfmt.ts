// logfmt-Logger für Tests, Format wie im Proxy: level=info msg="…" key=value
import type { ServerLogFields, ServerLogger } from "../server.js";

export interface TestLogger {
  logger: ServerLogger;
  /** Alle Zeilen in Reihenfolge */
  lines: string[];
}

/** Logger, der jede Zeile in `lines` sammelt; `base` steht vor den Feldern jeder Zeile */
export function createTestLogger(base: ServerLogFields = {}): TestLogger {
  const lines: string[] = [];
  const write = (level: string) => (msg: string, fields?: ServerLogFields) =>
    void lines.push(formatLine(level, msg, { ...base, ...fields }));
  return {
    lines,
    logger: {
      debug: write("debug"),
      info: write("info"),
      warn: write("warn"),
      error: write("error"),
    },
  };
}

export function formatLine(level: string, msg: string, fields: ServerLogFields = {}): string {
  const parts = [`level=${level}`, `msg=${escapeValue(msg)}`];
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) parts.push(`${key}=${escapeValue(String(value))}`);
  }
  return parts.join(" ");
}

function escapeValue(value: string): string {
  if (value !== "" && !/[\s"=\\]/.test(value)) return value;
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
  return `"${escaped}"`;
}
