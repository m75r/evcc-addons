// Prozesse und Ausgabe des Veröffentlichungs-Skripts
import { execFileSync } from "node:child_process";

/** Überschrift eines Schritts auf stdout */
export function step(title) {
  process.stdout.write(`\n▶ ${title}\n`);
}

export function info(text) {
  process.stdout.write(`  ${text}\n`);
}

/** Führt einen Befehl mit sichtbarer Ausgabe aus; ein Exit-Code ≠ 0 wirft mit dem Befehl in der Meldung */
export function run(command, args, cwd) {
  try {
    execFileSync(command, args, { cwd, stdio: "inherit" });
  } catch (err) {
    throw new Error(`${describe(command, args, cwd)} fehlgeschlagen: ${reason(err)}`, {
      cause: err,
    });
  }
}

/** Führt einen Befehl still aus und liefert stdout ohne Leerraum am Rand */
export function capture(command, args, cwd) {
  try {
    return execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
      .toString()
      .trim();
  } catch (err) {
    const stderr = err.stderr?.toString().trim();
    throw new Error(`${describe(command, args, cwd)} fehlgeschlagen: ${stderr || reason(err)}`, {
      cause: err,
    });
  }
}

function describe(command, args, cwd) {
  return `${command} ${args.join(" ")}${cwd ? ` (in ${cwd})` : ""}`;
}

function reason(err) {
  if (err.code === "ENOENT") return "Programm nicht gefunden";
  return err.status === undefined ? err.message : `Exit-Code ${err.status}`;
}
