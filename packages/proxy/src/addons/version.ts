// Versionsvergleich nach semver 2.0.0 (ohne Build-Metadaten), Eingaben erfüllen VERSION_PATTERN

/** <0: a älter, 0: gleich, >0: a neuer */
export function compareVersions(a: string, b: string): number {
  const [coreA, preA] = splitVersion(a);
  const [coreB, preB] = splitVersion(b);
  for (let i = 0; i < 3; i++) {
    const diff = coreA[i] - coreB[i];
    if (diff !== 0) return Math.sign(diff);
  }
  return comparePrerelease(preA, preB);
}

function splitVersion(version: string): [number[], string[]] {
  const dash = version.indexOf("-");
  const core = dash === -1 ? version : version.slice(0, dash);
  const pre = dash === -1 ? [] : version.slice(dash + 1).split(".");
  return [core.split(".").map(Number), pre];
}

/** Ohne Vorabversion ist neuer; sonst Bezeichner für Bezeichner, ein kürzerer Satz ist kleiner */
function comparePrerelease(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return Math.sign(b.length - a.length);
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const diff = compareIdentifier(a[i], b[i]);
    if (diff !== 0) return diff;
  }
  return Math.sign(a.length - b.length);
}

/** Numerische Bezeichner numerisch und vor alphanumerischen, sonst lexikalisch (ASCII) */
function compareIdentifier(a: string, b: string): number {
  const numA = /^\d+$/.test(a);
  const numB = /^\d+$/.test(b);
  if (numA && numB) return Math.sign(Number(a) - Number(b));
  if (numA !== numB) return numA ? -1 : 1;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
