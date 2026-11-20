export const MpvIpcErrorCode = {
  CONNECT_TIMEOUT: 'CONNECT_TIMEOUT',
  REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',
  CLOSED: 'CLOSED',
} as const;

export type MpvIpcErrorCode = (typeof MpvIpcErrorCode)[keyof typeof MpvIpcErrorCode];

/** The mpv pipe could not be reached or did not answer; the player may have exited. */
export class MpvIpcError extends Error {
  constructor(
    readonly code: MpvIpcErrorCode,
    message: string,
  ) {
    super(message);
    this.name = MpvIpcError.name;
  }
}
