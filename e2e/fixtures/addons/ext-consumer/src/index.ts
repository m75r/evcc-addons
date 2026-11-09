// E2E-Fixture: Seite mit den Badges aller Anbieter von fixture.badge
import type { ActivateFn, AddonApi } from "@evcc-addons/sdk";

interface Badge {
  text: string;
}

function renderBadges(api: AddonApi, list: HTMLElement): void {
  const items = api.extensions.get<Badge>("fixture.badge").map((entry) => {
    const li = document.createElement("li");
    li.textContent = `${entry.addonId}: ${entry.value.text}`;
    return li;
  });
  list.replaceChildren(...items);
}

export const activate: ActivateFn = (api) => {
  api.registerPage({
    title: "Erweiterungen",
    mount(el) {
      const list = document.createElement("ul");
      list.setAttribute("data-testid", "ext-badges");
      el.append(list);
      renderBadges(api, list);
      return api.extensions.onChange("fixture.badge", () => renderBadges(api, list));
    },
  });
};
