// Nachgebautes evcc-DOM (Menüleiste und Menü „Mehr“) für happy-dom-Tests

export const EVCC_DOM = `
<div id="app"><div class="app">
  <nav class="bottom-tab-bar d-flex" data-testid="bottom-tab-bar">
    <div class="container d-flex">
      <a class="tab-item d-flex router-link-active router-link-exact-active active" data-v-tab="" href="#/" data-testid="tab-laden">
        <span class="tab-content d-flex"><svg class="tab-icon"><path d="M0"></path></svg><span class="tab-label">Laden</span></span>
      </a>
      <a class="tab-item d-flex" data-v-tab="" href="#/forecast" data-testid="tab-vorhersage">
        <span class="tab-content d-flex"><svg class="tab-icon"></svg><span class="tab-label">Vorhersage</span></span>
      </a>
      <div class="tab-item d-flex" data-v-tab="" data-testid="tab-more" role="button">
        <span class="tab-content d-flex"><svg class="tab-icon"></svg><span class="tab-label">Mehr</span></span>
        <div class="more-menu dropdown-menu" data-v-menu="">
          <a class="dropdown-item" data-v-menu="" href="#/log">Protokoll</a>
          <a class="dropdown-item router-link-active active" data-v-menu="" href="#/config">Konfiguration</a>
          <a class="dropdown-item d-sm-none" data-v-menu="" href="#/sessions">Ladungen</a>
        </div>
      </div>
    </div>
  </nav>
</div></div>`;

export function renderEvccDom(): void {
  document.documentElement.lang = "de";
  document.documentElement.className = "";
  document.body.innerHTML = EVCC_DOM;
}

/** Wartet auf den nächsten Animation-Frame (keepInserted drosselt per rAF) */
export function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
