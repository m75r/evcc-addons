// Gemeinsamer Kontext der API-Handler
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddonStore } from "../addons/store.js";
import type { StatusRegistry } from "../addons/status.js";
import type { ProxyConfig } from "../config.js";
import type { Logger } from "../logger.js";

export interface ApiContext {
  config: ProxyConfig;
  store: AddonStore;
  status: StatusRegistry;
  logger: Logger;
}

export type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  ctx: ApiContext,
  params: string[],
) => Promise<void> | void;

export interface Route {
  method: string;
  pattern: RegExp;
  handler: Handler;
}
