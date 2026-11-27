export const MpvIpcMessage = {
  pipeUnreachable: (pipePath: string): string => `mpv pipe unreachable: ${pipePath}`,
  closedWhileConnecting: 'mpv IPC client closed while connecting',
  notConnected: 'mpv IPC is not connected',
  noAnswer: (command: unknown): string => `mpv did not answer ${String(command)}`,
  connectionClosed: 'mpv IPC connection closed',
  replyTooLong: 'mpv IPC reply line exceeded the buffer limit',
} as const;
