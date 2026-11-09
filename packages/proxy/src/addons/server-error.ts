// Fehler aus dem Server-Teil eines Addons (`server.httpError`): freier Code, ausdrücklicher Status

const MIN_ERROR_STATUS = 400;
const MAX_ERROR_STATUS = 599;

export class ServerAddonError extends Error {
  override name = "ServerAddonError";
  readonly status: number;

  /** Ein Status außerhalb von 400–599 wird zu 500 */
  constructor(
    status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    const valid =
      Number.isInteger(status) && status >= MIN_ERROR_STATUS && status <= MAX_ERROR_STATUS;
    this.status = valid ? status : 500;
  }
}
