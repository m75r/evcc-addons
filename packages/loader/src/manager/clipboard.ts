// Text in die Zwischenablage; navigator.clipboard gibt es nur in sicheren Kontexten (HTTPS,
// localhost). evcc läuft meist unter http://<host>, dort hilft nur der Weg über execCommand.

export async function copyText(text: string): Promise<void> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      return await navigator.clipboard.writeText(text);
    } catch {
      // Z. B. fehlende Berechtigung: weiter mit dem Rückfall unten
    }
  }
  copyWithTextarea(text);
}

/** Kopiert über ein unsichtbares Textfeld; wirft, wenn der Browser ablehnt */
function copyWithTextarea(text: string): void {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  try {
    if (!document.execCommand("copy")) throw new Error("Der Browser hat das Kopieren abgelehnt");
  } finally {
    area.remove();
  }
}

/** Markiert den Inhalt eines Elements, damit er von Hand kopiert werden kann */
export function selectContents(element: Element): void {
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}
