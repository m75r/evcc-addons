// Antwort von GitHub releases/latest für Tests; Kurzfelder assetName, digest und downloadUrl betreffen das .deb
const KNOWN = new Set(["assetName", "digest", "downloadUrl"]);

/**
 * Release mit einem .deb-Asset und dem SDK-Tarball. Felder mit `undefined` entfallen im JSON,
 * `assets` ersetzt die Asset-Liste vollständig.
 */
export function releaseJson(fields: Record<string, unknown> = {}): Record<string, unknown> {
  const tag = typeof fields.tag_name === "string" ? fields.tag_name : "v2.2.0";
  const version = tag.replace(/^v/, "");
  const assetName = (fields.assetName as string | undefined) ?? `evcc-addons_${version}_all.deb`;
  const base = `https://github.com/m75r/evcc-addons/releases/download/${tag}`;
  const deb = {
    name: assetName,
    browser_download_url: "downloadUrl" in fields ? fields.downloadUrl : `${base}/${assetName}`,
    digest: "digest" in fields ? fields.digest : `sha256:${"a".repeat(64)}`,
  };
  const sdk = { name: `evcc-addons-sdk-${version}.tgz`, browser_download_url: `${base}/sdk.tgz` };
  const rest = Object.fromEntries(Object.entries(fields).filter(([key]) => !KNOWN.has(key)));
  return {
    tag_name: tag,
    published_at: "2026-11-12T10:00:00Z",
    html_url: `https://github.com/m75r/evcc-addons/releases/tag/${tag}`,
    assets: [sdk, deb],
    ...rest,
  };
}
