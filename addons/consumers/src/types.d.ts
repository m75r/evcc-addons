// CSS-Dateien werden beim Bauen als Zeichenkette importiert
declare module "*.css" {
  const css: string;
  export default css;
}
