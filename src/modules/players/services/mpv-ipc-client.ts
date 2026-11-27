import { randomUUID } from 'node:crypto';
import { connect, Socket } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

import {
  MPV_COMMAND_GET_PROPERTY,
  MPV_COMMAND_SCREENSHOT_TO_FILE,
  MPV_IPC_CONNECT_RETRY_MS,
  MPV_IPC_CONNECT_TIMEOUT_MS,
  MPV_IPC_MAX_BUFFER_CHARS,
  LAUNCH_ID_LENGTH,
  MPV_IPC_REQUEST_TIMEOUT_MS,
  MPV_IPC_SUCCESS,
  MPV_PIPE_PREFIX,
  LINE_SEPARATOR,
  MPV_PROPERTY_FRAME_NUMBER,
  MPV_SCREENSHOT_FLAGS,
} from '../constants/players.constants';
import { MpvIpcMessage } from '../constants/mpv-ipc-messages.constants';
import { MpvIpcError } from '../errors/mpv-ipc.error';

export interface MpvIpcOptions {
  connectTimeoutMs: number;
  connectRetryMs: number;
  requestTimeoutMs: number;
}

export const DEFAULT_MPV_IPC_OPTIONS: MpvIpcOptions = {
  connectTimeoutMs: MPV_IPC_CONNECT_TIMEOUT_MS,
  connectRetryMs: MPV_IPC_CONNECT_RETRY_MS,
  requestTimeoutMs: MPV_IPC_REQUEST_TIMEOUT_MS,
};

export interface MpvReply {
  request_id?: number;
  error?: string;
  data?: unknown;
}

interface PendingRequest {
  resolve: (reply: MpvReply) => void;
  reject: (error: MpvIpcError) => void;
  timer: NodeJS.Timeout;
}

/** A new id per mpv launch, so a window still closing never holds the pipe name of the next one. */
export function newLaunchId(): string {
  return randomUUID().replaceAll('-', '').slice(0, LAUNCH_ID_LENGTH);
}

export function mpvPipePath(launchId: string, key: string): string {
  return `${MPV_PIPE_PREFIX}${launchId}-${key}`;
}

/** One JSON IPC connection to a running mpv, kept open for the life of the player. */
export class MpvIpcClient {
  private socket: Socket | null = null;
  private buffer = '';
  private nextRequestId = 1;
  private closed = false;
  private connecting: Promise<void> | null = null;
  private readonly pending = new Map<number, PendingRequest>();

  constructor(
    private readonly pipePath: string,
    private readonly options: MpvIpcOptions = DEFAULT_MPV_IPC_OPTIONS,
  ) {}

  // mpv creates its pipe a moment after launch, so early attempts fail with ENOENT.
  connect(): Promise<void> {
    if (this.socket) return Promise.resolve();
    this.connecting ??= this.connectWithRetry().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private async connectWithRetry(): Promise<void> {
    const deadline = Date.now() + this.options.connectTimeoutMs;
    while (!this.closed) {
      let socket: Socket;
      try {
        socket = await openPipe(this.pipePath);
      } catch {
        if (Date.now() + this.options.connectRetryMs > deadline) {
          throw new MpvIpcError(MpvIpcMessage.pipeUnreachable(this.pipePath));
        }
        await delay(this.options.connectRetryMs);
        continue;
      }
      if (this.closed) {
        socket.destroy();
        break;
      }
      this.attach(socket);
      return;
    }
    throw new MpvIpcError(MpvIpcMessage.closedWhileConnecting);
  }

  command(args: unknown[]): Promise<MpvReply> {
    const socket = this.socket;
    if (!socket || socket.destroyed) {
      return Promise.reject(new MpvIpcError(MpvIpcMessage.notConnected));
    }
    const requestId = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new MpvIpcError(MpvIpcMessage.noAnswer(args[0])));
      }, this.options.requestTimeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      socket.write(JSON.stringify({ command: args, request_id: requestId }) + LINE_SEPARATOR);
    });
  }

  /** The property value, or null while mpv reports it unavailable. */
  async getProperty(name: string): Promise<unknown> {
    const reply = await this.command([MPV_COMMAND_GET_PROPERTY, name]);
    return reply.error === MPV_IPC_SUCCESS ? (reply.data ?? null) : null;
  }

  async framesShown(): Promise<number> {
    const frames = await this.getProperty(MPV_PROPERTY_FRAME_NUMBER);
    return typeof frames === 'number' ? frames : 0;
  }

  /** Saves the current video frame; the destination folder must exist. */
  async screenshotToFile(dest: string): Promise<boolean> {
    const reply = await this.command([MPV_COMMAND_SCREENSHOT_TO_FILE, dest, MPV_SCREENSHOT_FLAGS]);
    return reply.error === MPV_IPC_SUCCESS;
  }

  close(): void {
    this.closed = true;
    this.socket?.destroy();
    this.socket = null;
    this.failPending();
  }

  private attach(socket: Socket): void {
    this.socket = socket;
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => this.onData(chunk));
    // 'close' always follows 'error'; pending requests are failed there.
    socket.on('error', () => undefined);
    socket.on('close', () => {
      if (this.socket === socket) {
        this.socket = null;
        // A partial line of this pipe would corrupt the first reply of the next connection.
        this.buffer = '';
      }
      this.failPending();
    });
  }

  // Event notifications share the pipe; only replies carry one of our request ids.
  private onData(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split(LINE_SEPARATOR);
    this.buffer = lines.pop() ?? '';
    for (const line of lines) {
      const reply = parseReply(line);
      const id = reply?.request_id;
      const request = id === undefined ? undefined : this.pending.get(id);
      if (reply && request) {
        clearTimeout(request.timer);
        this.pending.delete(id as number);
        request.resolve(reply);
      }
    }
    if (this.buffer.length > MPV_IPC_MAX_BUFFER_CHARS) {
      this.buffer = '';
      this.socket?.destroy(new Error(MpvIpcMessage.replyTooLong));
    }
  }

  private failPending(): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(new MpvIpcError(MpvIpcMessage.connectionClosed));
    }
    this.pending.clear();
  }
}

function openPipe(path: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect(path);
    socket.once('connect', () => {
      socket.off('error', reject);
      resolve(socket);
    });
    socket.once('error', reject);
  });
}

function parseReply(line: string): MpvReply | null {
  try {
    const value: unknown = JSON.parse(line);
    return typeof value === 'object' && value !== null ? (value as MpvReply) : null;
  } catch {
    return null;
  }
}
