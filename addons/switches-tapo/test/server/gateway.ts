// Startet den Server-Teil von switches-tapo auf der Test-ServerApi des SDK
import type { SettingValues } from "@evcc-addons/sdk";
import type { ServerAddonHandle } from "@evcc-addons/sdk/server";
import { createTestServerApi, type TestServerApi } from "@evcc-addons/sdk/testing/harness";
import { activateServer } from "../../src/server/index.js";

export interface TestGateway {
  harness: TestServerApi;
  stop(): Promise<void>;
}

export async function startGateway(
  evccUrl: string,
  settings: SettingValues = {},
): Promise<TestGateway> {
  const harness = await createTestServerApi({ id: "switches-tapo", evccUrl, settings });
  const handle = (await activateServer(harness.api)) as ServerAddonHandle;
  return {
    harness,
    stop: async () => {
      await handle.stop();
      await harness.close();
    },
  };
}
