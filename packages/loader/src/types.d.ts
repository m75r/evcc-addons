// CSS-Dateien werden von esbuild (loader "text") bzw. im Test als Zeichenkette importiert
declare module "*.css" {
  const css: string;
  export default css;
}

// evcc legt die Vue-Root-Instanz unter window.app ab (app.ts:126)
interface VueRouterLike {
  push(path: string): Promise<unknown>;
  afterEach(guard: (to: { path: string }) => void): () => void;
}

interface Window {
  app?: { $router?: VueRouterLike };
  /** von evcc globals.js gesetzt */
  evcc?: { customBrand?: string };
}
