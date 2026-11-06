// Version des Proxys; in Tests (ohne esbuild-define) "dev"
export const VERSION: string = typeof __VERSION__ === "string" ? __VERSION__ : "dev";
