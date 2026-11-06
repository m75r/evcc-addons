import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RouteWatcher, currentPath, navigate } from "../src/nav/router.js";

/**
 * Router wie vue-router: meldet Navigation nur über afterEach-Hooks.
 * vue-router navigiert per pushState, das im Browser weder hashchange noch popstate auslöst.
 * happy-dom feuert dabei abweichend hashchange, deshalb verändert der Fake die History nicht.
 */
class FakeRouter {
  readonly guards: ((to: { path: string }) => void)[] = [];
  readonly pushed: string[] = [];

  push(path: string): Promise<void> {
    this.pushed.push(path);
    for (const guard of this.guards) guard({ path });
    return Promise.resolve();
  }

  afterEach(guard: (to: { path: string }) => void): () => void {
    this.guards.push(guard);
    return () => this.guards.splice(this.guards.indexOf(guard), 1);
  }
}

let watcher: RouteWatcher | undefined;

beforeEach(() => {
  history.replaceState(null, "", "#/");
  delete window.app;
});

afterEach(() => {
  watcher?.dispose();
  watcher = undefined;
  delete window.app;
});

describe("currentPath", () => {
  it("liest den Hash ohne Query", () => {
    history.replaceState(null, "", "#/addons/hello?x=1");
    expect(currentPath()).toBe("/addons/hello");
    history.replaceState(null, "", "#");
    expect(currentPath()).toBe("/");
  });
});

describe("navigate", () => {
  it("nutzt den evcc-Router, wenn vorhanden", () => {
    const router = new FakeRouter();
    window.app = { $router: router };
    navigate("/addons");
    expect(router.pushed).toEqual(["/addons"]);
  });

  it("setzt sonst den Hash", () => {
    navigate("/addons");
    expect(location.hash).toBe("#/addons");
  });
});

describe("RouteWatcher", () => {
  it("meldet Navigation per afterEach ohne hashchange", async () => {
    const router = new FakeRouter();
    watcher = new RouteWatcher({ pollMs: 5 });
    const listener = vi.fn();
    watcher.onChange(listener);
    window.app = { $router: router };
    await expect.poll(() => router.guards.length).toBe(1);
    await router.push("/addons");
    await router.push("/addons");
    await router.push("/forecast");
    expect(listener.mock.calls).toEqual([["/addons"], ["/forecast"]]);
  });

  it("nutzt hashchange als Rückfall", () => {
    watcher = new RouteWatcher({ pollMs: 5 });
    const listener = vi.fn();
    watcher.onChange(listener);
    history.replaceState(null, "", "#/addons");
    window.dispatchEvent(new Event("hashchange"));
    expect(listener).toHaveBeenCalledWith("/addons");
  });
});
