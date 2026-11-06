// Setzt eigene Elemente wieder ein, wenn Vue sie beim Neurendern entfernt

/** Ruft `check` nach DOM-Änderungen auf, höchstens einmal pro Frame */
export function keepInserted(check: () => void): () => void {
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      check();
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}
