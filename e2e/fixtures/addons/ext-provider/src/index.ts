// E2E-Fixture: stellt verzögert fixture.badge bereit und registriert den Dialog „Fixture“
import type { ActivateFn, AddonApi, ManagerDialogContext } from "@evcc-addons/sdk";

const ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="8"/></svg>';
const BADGE_DELAY_MS = 300;

function paragraph(el: HTMLElement, testId: string, text: string): HTMLParagraphElement {
  const p = document.createElement("p");
  p.setAttribute("data-testid", testId);
  p.textContent = text;
  el.append(p);
  return p;
}

/** Zeigt canManage und das Echo des eigenen Server-Teils */
function mountDialog(api: AddonApi, el: HTMLElement, ctx: ManagerDialogContext): void {
  paragraph(el, "fixture-can-manage", `canManage=${String(ctx.canManage)}`);
  const echo = paragraph(el, "fixture-echo", "…");
  api
    .serverApi("echo")
    .then((res) => res.json())
    .then(
      (body: unknown) => (echo.textContent = JSON.stringify(body)),
      (err: unknown) => (echo.textContent = `Fehler: ${String(err)}`),
    );
}

export const activate: ActivateFn = (api) => {
  // Verzögert, damit der Nutzer den späten Anbieter über onChange erhält
  setTimeout(
    () => api.extensions.provide("fixture.badge", { text: "Badge von ext-provider" }),
    BADGE_DELAY_MS,
  );
  api.addManagerDialog({
    label: "Fixture",
    title: "Fixture",
    icon: ICON,
    mount: (el, ctx) => mountDialog(api, el, ctx),
  });
};
