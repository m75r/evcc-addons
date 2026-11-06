// Hash-Routing im evcc-Fenster: aktueller Pfad, Navigation und Routenwechsel

/** Pfad aus dem Hash ohne `#` und Query, z. B. `#/addons?x=1` → `/addons` */
export function currentPath(): string {
  const path = location.hash.replace(/^#/, "").split("?")[0];
  return path === "" ? "/" : path;
}

/** Navigiert über den evcc-Router, sonst über den Hash */
export function navigate(path: string): void {
  const router = window.app?.$router;
  if (!router) {
    location.hash = "#" + path;
    return;
  }
  router.push(path).catch(() => {
    // Navigation vom Router abgelehnt: Hash als Rückfallweg
    location.hash = "#" + path;
  });
}

export type RouteListener = (path: string) => void;

export interface RouteWatcherOptions {
  pollMs?: number;
  maxWaitMs?: number;
}

/** Meldet Routenwechsel, vor allem über `$router.afterEach` (pushState löst keine Events aus) */
export class RouteWatcher {
  private readonly listeners = new Set<RouteListener>();
  private lastPath = currentPath();
  private readonly disposers: (() => void)[] = [];

  constructor(opts: RouteWatcherOptions = {}) {
    const onEvent = () => this.emit(currentPath());
    window.addEventListener("hashchange", onEvent);
    window.addEventListener("popstate", onEvent);
    this.disposers.push(() => window.removeEventListener("hashchange", onEvent));
    this.disposers.push(() => window.removeEventListener("popstate", onEvent));
    this.waitForRouter(opts.pollMs ?? 100, opts.maxWaitMs ?? 30000);
  }

  onChange(listener: RouteListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    for (const dispose of this.disposers.splice(0)) dispose();
    this.listeners.clear();
  }

  private waitForRouter(pollMs: number, maxWaitMs: number): void {
    const started = Date.now();
    const timer = setInterval(() => {
      const router = window.app?.$router;
      if (router) {
        clearInterval(timer);
        this.disposers.push(router.afterEach((to) => this.emit(to.path)));
        this.emit(currentPath());
      } else if (Date.now() - started > maxWaitMs) clearInterval(timer);
    }, pollMs);
    this.disposers.push(() => clearInterval(timer));
  }

  private emit(path: string): void {
    if (path === this.lastPath) return;
    this.lastPath = path;
    for (const listener of this.listeners) listener(path);
  }
}

let shared: RouteWatcher | undefined;

/** Gemeinsamer Watcher für den Loader */
export function onRouteChange(listener: RouteListener): () => void {
  shared ??= new RouteWatcher();
  return shared.onChange(listener);
}
