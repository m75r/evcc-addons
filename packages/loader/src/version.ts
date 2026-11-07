// Version von evcc-addons, wie der Proxy sie in den Loader-Tag schreibt

/** Version von evcc-addons aus dem Loader-Tag (`loader.js?v=<VERSION>`), sonst null */
export function loaderVersion(url: string = import.meta.url): string | null {
  const v = new URL(url).searchParams.get("v");
  return v ? v : null;
}
