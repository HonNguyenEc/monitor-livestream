/** The mpv pipe could not be reached or did not answer; the player may have exited. */
export class MpvIpcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = MpvIpcError.name;
  }
}
