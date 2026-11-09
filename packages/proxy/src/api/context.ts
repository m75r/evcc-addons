// Gemeinsamer Kontext der API-Handler
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ServerAddonHost } from "../addons/server-host.js";
import type { AddonStore } from "../addons/store.js";
import type { StatusRegistry } from "../addons/status.js";
import type { ProxyConfig } from "../config.js";
import type { Logger } from "../logger.js";

export interface ApiContext {
  config: ProxyConfig;
  store: AddonStore;
  status: StatusRegistry;
  logger: Logger;
  serverAddons: ServerAddonHost;
}

export type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  ctx: ApiContext,
  params: string[],
) => Promise<void> | void;

export interface Route {
  /** HTTP-Methode oder `*` für alle */
  method: string;
  pattern: RegExp;
  handler: Handler;
}
