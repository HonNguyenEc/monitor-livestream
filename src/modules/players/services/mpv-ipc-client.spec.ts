import { createServer, Server, Socket } from 'node:net';

import { MPV_IPC_MAX_BUFFER_CHARS } from '../constants/players.constants';
import { MpvIpcError, MpvIpcErrorCode } from '../errors/mpv-ipc.error';
import { MpvIpcClient, MpvIpcOptions, mpvPipePath, newLaunchId } from './mpv-ipc-client';

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
  return mpvPipePath(`test${process.pid}`, `${pipeCounter}`);
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
  it('names the pipe by launch and channel, apart from the Python tool pipes', () => {
    expect(mpvPipePath('ab12cd34', 'tiktok_shop')).toBe(
      '\\\\.\\pipe\\live-qc-ab12cd34-tiktok_shop',
    );
  });

  it('gives every launch its own id', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newLaunchId()));

    expect(ids.size).toBe(50);
    expect([...ids][0]).toMatch(/^[0-9a-f]{8}$/);
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

  it('shares one connection between repeated connect calls', async () => {
    const path = uniquePipe();
    let connections = 0;
    server = await startFakeMpv(path, () => undefined);
    server.on('connection', () => (connections += 1));
    client = new MpvIpcClient(path, FAST);

    await Promise.all([client.connect(), client.connect()]);
    await client.connect();

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(connections).toBe(1);
  });

  it('reconnects after the pipe closes', async () => {
    const path = uniquePipe();
    let connections = 0;
    server = await startFakeMpv(path, (request, socket) =>
      reply(socket, request, { error: 'success', data: 7 }),
    );
    server.on('connection', () => (connections += 1));
    client = new MpvIpcClient(path, FAST);
    await client.connect();
    await new Promise((resolve) => setTimeout(resolve, 50));
    serverSockets.forEach((socket) => socket.destroy());
    await new Promise((resolve) => setTimeout(resolve, 50));

    await client.connect();

    expect(await client.framesShown()).toBe(7);
    expect(connections).toBe(2);
  });

  it('drops a partial line of the closed pipe before reading the new one', async () => {
    const path = uniquePipe();
    server = await startFakeMpv(path, (request, socket) =>
      reply(socket, request, { error: 'success', data: 9 }),
    );
    const closed = new Promise<void>((resolve) => {
      server?.once('connection', (socket) => {
        socket.once('close', () => resolve());
        socket.write('{"event":"pro');
        setTimeout(() => socket.destroy(), 20);
      });
    });
    client = new MpvIpcClient(path, FAST);
    await client.connect();
    await closed;
    // The client sees the close one event-loop turn after the server did.
    await new Promise((resolve) => setTimeout(resolve, 100));

    await client.connect();

    expect(await client.framesShown()).toBe(9);
  });

  it('can connect again after a connect attempt timed out', async () => {
    const path = uniquePipe();
    client = new MpvIpcClient(path, { ...FAST, connectTimeoutMs: 60 });
    await expect(client.connect()).rejects.toMatchObject({ code: MpvIpcErrorCode.CONNECT_TIMEOUT });
    server = await startFakeMpv(path, (request, socket) =>
      reply(socket, request, { error: 'success', data: 3 }),
    );

    await client.connect();

    expect(await client.framesShown()).toBe(3);
  });

  it('answers replies that arrive in the same chunk as an oversized partial line', async () => {
    const path = uniquePipe();
    server = await startFakeMpv(path, (request, socket) =>
      socket.write(
        JSON.stringify({ request_id: request.request_id, error: 'success', data: 5 }) +
          '\n' +
          'x'.repeat(MPV_IPC_MAX_BUFFER_CHARS + 1),
      ),
    );
    client = new MpvIpcClient(path, FAST);
    await client.connect();

    expect(await client.framesShown()).toBe(5);
  });

  it('drops the connection when a reply line outgrows the buffer limit', async () => {
    const path = uniquePipe();
    server = await startFakeMpv(path, (_request, socket) =>
      socket.write('x'.repeat(MPV_IPC_MAX_BUFFER_CHARS + 1)),
    );
    client = new MpvIpcClient(path, FAST);
    await client.connect();

    await expect(client.framesShown()).rejects.toMatchObject({ code: MpvIpcErrorCode.CLOSED });
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
