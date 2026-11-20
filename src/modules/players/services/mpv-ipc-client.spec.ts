import { createServer, Server, Socket } from 'node:net';

import { MpvIpcError, MpvIpcErrorCode } from '../errors/mpv-ipc.error';
import { MpvIpcClient, MpvIpcOptions, mpvPipePath } from './mpv-ipc-client';

const FAST: MpvIpcOptions = { connectTimeoutMs: 1_000, connectRetryMs: 20, requestTimeoutMs: 200 };

interface Request {
  command: unknown[];
  request_id: number;
}

type Responder = (request: Request, socket: Socket) => void;

const serverSockets = new Set<Socket>();

let pipeCounter = 0;
function uniquePipe(): string {
  pipeCounter += 1;
  return mpvPipePath(`test-${process.pid}-${pipeCounter}`);
}

function startFakeMpv(path: string, respond: Responder): Promise<Server> {
  const server = createServer((socket) => {
    serverSockets.add(socket);
    let buffer = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      lines.forEach((line) => respond(JSON.parse(line) as Request, socket));
    });
  });
  return new Promise((resolve) => server.listen(path, () => resolve(server)));
}

function reply(socket: Socket, request: Request, fields: object): void {
  socket.write(JSON.stringify({ request_id: request.request_id, ...fields }) + '\n');
}

describe('mpvPipePath', () => {
  it('uses the Python tool pipe name', () => {
    expect(mpvPipePath('tiktok_shop')).toBe('\\\\.\\pipe\\livestream-qc-tiktok_shop');
  });
});

describe('MpvIpcClient', () => {
  let server: Server | null;
  let client: MpvIpcClient;

  afterEach(async () => {
    client?.close();
    const running = server;
    if (running) {
      serverSockets.forEach((socket) => socket.destroy());
      serverSockets.clear();
      await new Promise<void>((resolve) => running.close(() => resolve()));
    }
    server = null;
  });

  it('reads estimated-frame-number', async () => {
    const path = uniquePipe();
    const commands: unknown[][] = [];
    server = await startFakeMpv(path, (request, socket) => {
      commands.push(request.command);
      reply(socket, request, { error: 'success', data: 42 });
    });
    client = new MpvIpcClient(path, FAST);
    await client.connect();

    expect(await client.framesShown()).toBe(42);
    expect(commands).toEqual([['get_property', 'estimated-frame-number']]);
  });

  it('reports 0 frames while the property is unavailable', async () => {
    const path = uniquePipe();
    server = await startFakeMpv(path, (request, socket) =>
      reply(socket, request, { error: 'property unavailable' }),
    );
    client = new MpvIpcClient(path, FAST);
    await client.connect();

    expect(await client.framesShown()).toBe(0);
  });

  it('matches replies by request_id and skips events and split lines', async () => {
    const path = uniquePipe();
    const held: Array<[Request, Socket]> = [];
    server = await startFakeMpv(path, (request, socket) => {
      held.push([request, socket]);
      if (held.length < 2) {
        return;
      }
      // Answer out of order, with an event in between and the second reply split in two writes.
      const [[first], [second]] = held;
      socket.write('{"event":"playback-restart"}\n');
      reply(socket, second, { error: 'success', data: 'second' });
      const line = JSON.stringify({
        request_id: first.request_id,
        error: 'success',
        data: 'first',
      });
      socket.write(line.slice(0, 5));
      setTimeout(() => socket.write(line.slice(5) + '\n'), 10);
    });
    client = new MpvIpcClient(path, FAST);
    await client.connect();

    const results = await Promise.all([client.getProperty('a'), client.getProperty('b')]);

    expect(results).toEqual(['first', 'second']);
  });

  it('sends screenshot-to-file with the video flag', async () => {
    const path = uniquePipe();
    let command: unknown[] = [];
    server = await startFakeMpv(path, (request, socket) => {
      command = request.command;
      reply(socket, request, { error: 'success' });
    });
    client = new MpvIpcClient(path, FAST);
    await client.connect();

    expect(await client.screenshotToFile('C:\\checks\\latest.jpg')).toBe(true);
    expect(command).toEqual(['screenshot-to-file', 'C:\\checks\\latest.jpg', 'video']);
  });

  it('reports a failed screenshot', async () => {
    const path = uniquePipe();
    server = await startFakeMpv(path, (request, socket) =>
      reply(socket, request, { error: 'error running command' }),
    );
    client = new MpvIpcClient(path, FAST);
    await client.connect();

    expect(await client.screenshotToFile('C:\\checks\\latest.jpg')).toBe(false);
  });

  it('retries until the pipe appears', async () => {
    const path = uniquePipe();
    client = new MpvIpcClient(path, FAST);
    const connecting = client.connect();
    await new Promise((resolve) => setTimeout(resolve, 100));
    server = await startFakeMpv(path, (request, socket) =>
      reply(socket, request, { error: 'success', data: 1 }),
    );

    await connecting;

    expect(await client.framesShown()).toBe(1);
  });

  it('gives up connecting after the timeout', async () => {
    server = null;
    client = new MpvIpcClient(uniquePipe(), { ...FAST, connectTimeoutMs: 100 });

    await expect(client.connect()).rejects.toMatchObject({ code: MpvIpcErrorCode.CONNECT_TIMEOUT });
  });

  it('times out a request mpv never answers', async () => {
    const path = uniquePipe();
    server = await startFakeMpv(path, () => undefined);
    client = new MpvIpcClient(path, FAST);
    await client.connect();

    await expect(client.framesShown()).rejects.toMatchObject({
      code: MpvIpcErrorCode.REQUEST_TIMEOUT,
    });
  });

  it('fails pending requests when mpv exits', async () => {
    const path = uniquePipe();
    server = await startFakeMpv(path, (_request, socket) => socket.destroy());
    client = new MpvIpcClient(path, FAST);
    await client.connect();

    const error = await client.framesShown().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MpvIpcError);
    expect(error).toMatchObject({ code: MpvIpcErrorCode.CLOSED });
  });

  it('rejects requests after close', async () => {
    const path = uniquePipe();
    server = await startFakeMpv(path, () => undefined);
    client = new MpvIpcClient(path, FAST);
    await client.connect();
    const pending = client.framesShown();

    client.close();

    await expect(pending).rejects.toMatchObject({ code: MpvIpcErrorCode.CLOSED });
    await expect(client.framesShown()).rejects.toMatchObject({ code: MpvIpcErrorCode.CLOSED });
  });

  it('stops retrying when closed while connecting', async () => {
    client = new MpvIpcClient(uniquePipe(), FAST);
    const connecting = client.connect();

    client.close();

    await expect(connecting).rejects.toMatchObject({ code: MpvIpcErrorCode.CLOSED });
  });
});
