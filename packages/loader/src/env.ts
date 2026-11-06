// Sprache und Theme des evcc-Fensters

export function locale(): string {
  return document.documentElement.lang || "en";
}

export function theme(): "light" | "dark" {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** Meldet Änderungen von `<html lang>` und `<html class>` (Theme) */
export function onEnvChange(cb: () => void): () => void {
  let last = `${locale()}|${theme()}`;
  const observer = new MutationObserver(() => {
    const next = `${locale()}|${theme()}`;
    if (next === last) return;
    last = next;
    cb();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["lang", "class"],
  });
  return () => observer.disconnect();
}
