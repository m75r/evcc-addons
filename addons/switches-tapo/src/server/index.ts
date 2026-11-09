// Server-Teil von switches-tapo: Tapo-Gateway im Proxy, Daten in addon-data/switches-tapo/
import type { ServerActivateFn } from "@evcc-addons/sdk/server";
import { SwitchManager, pollMsFromSetting, type SwitchManagerOptions } from "./manager.js";
import { registerRoutes } from "./routes.js";

/** Austauschbar für Tests (Fake-Geräte, Fake-evcc) */
export type GatewayOverrides = Pick<SwitchManagerOptions, "createDevice" | "evcc" | "now">;

/** Ein ungültiges switches.json wirft hier und erscheint als Startfehler auf der Karte */
export function createGateway(overrides: GatewayOverrides = {}): ServerActivateFn {
  return async (server) => {
    const manager = new SwitchManager({
      dataDir: server.dataDir,
      evccUrl: server.evccUrl,
      logger: server.logger,
      pollMs: pollMsFromSetting(server.settings.get("pollSeconds")),
      ...overrides,
    });
    await manager.start();
    registerRoutes(server, manager);
    const off = server.settings.onChange((values) =>
      manager.setPollMs(pollMsFromSetting(values.pollSeconds)),
    );
    return {
      stop: () => {
        off();
        manager.stop();
      },
    };
  };
}

export const activateServer: ServerActivateFn = createGateway();
