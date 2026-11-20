import { connect, Socket } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

import {
  MPV_COMMAND_GET_PROPERTY,
  MPV_COMMAND_SCREENSHOT_TO_FILE,
  MPV_IPC_CONNECT_RETRY_MS,
  MPV_IPC_CONNECT_TIMEOUT_MS,
  MPV_IPC_REQUEST_TIMEOUT_MS,
  MPV_IPC_SUCCESS,
  MPV_PIPE_PREFIX,
  MPV_PROPERTY_FRAME_NUMBER,
  MPV_SCREENSHOT_FLAGS,
} from '../constants/players.constants';
import { MpvIpcError, MpvIpcErrorCode } from '../errors/mpv-ipc.error';

const LINE_SEPARATOR = '\n';

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

export function mpvPipePath(key: string): string {
  return `${MPV_PIPE_PREFIX}${key}`;
}

/** One JSON IPC connection to a running mpv, kept open for the life of the player. */
export class MpvIpcClient {
  private socket: Socket | null = null;
  private buffer = '';
  private nextRequestId = 1;
  private closed = false;
  private readonly pending = new Map<number, PendingRequest>();

  constructor(
    private readonly pipePath: string,
    private readonly options: MpvIpcOptions = DEFAULT_MPV_IPC_OPTIONS,
  ) {}

  // mpv creates its pipe a moment after launch, so early attempts fail with ENOENT.
  async connect(): Promise<void> {
    const deadline = Date.now() + this.options.connectTimeoutMs;
    while (!this.closed) {
      let socket: Socket;
      try {
        socket = await openPipe(this.pipePath);
      } catch {
        if (Date.now() + this.options.connectRetryMs > deadline) {
          throw new MpvIpcError(
            MpvIpcErrorCode.CONNECT_TIMEOUT,
            `mpv pipe unreachable: ${this.pipePath}`,
          );
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
    throw new MpvIpcError(MpvIpcErrorCode.CLOSED, 'mpv IPC client closed while connecting');
  }

  command(args: unknown[]): Promise<MpvReply> {
    const socket = this.socket;
    if (!socket || socket.destroyed) {
      return Promise.reject(new MpvIpcError(MpvIpcErrorCode.CLOSED, 'mpv IPC is not connected'));
    }
    const requestId = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(
          new MpvIpcError(MpvIpcErrorCode.REQUEST_TIMEOUT, `mpv did not answer ${String(args[0])}`),
        );
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
    socket.on('close', () => this.failPending());
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
  }

  private failPending(): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(new MpvIpcError(MpvIpcErrorCode.CLOSED, 'mpv IPC connection closed'));
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
