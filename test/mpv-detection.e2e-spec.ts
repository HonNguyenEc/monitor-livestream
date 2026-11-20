import { EventEmitter } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { NestFastifyApplication } from '@nestjs/platform-fastify';

import { createTestApp } from './helpers/create-test-app';
import { createDataDir, removeDataDir } from './helpers/data-dir';
import { hang, JPEG } from './helpers/frame-grabs';
import { callApi } from './helpers/http';
import { fakeChildProcessRegistry } from './helpers/outbound-fakes';
import { pollUntil } from './helpers/poll-until';

const SHOP = 'tiktok_sample_shop';
const PID = 5150;
const PLAYER = { path: 'C:\\Program Files\\MPV Player\\mpv.exe', supportsMediaControlsFlag: true };
const STREAM_RUN = {
  exitCode: 0,
  stdout: 'https://cdn.example/live.flv\n',
  stderr: '',
  timedOut: false,
};
const WAIT_LIMIT_MS = 6_000;

class FakeMpv extends EventEmitter {
  pid = PID;
  exitCode: number | null = null;
  signalCode: string | null = null;
}

describe('Monitor Livestream mpv detection (e2e)', () => {
  let app: NestFastifyApplication;
  let dataDir: string;
  let launched: Array<{ file: string; args: string[] }>;
  let killed: number[];
  let closed: number;
  let frames: number;

  beforeEach(async () => {
    launched = [];
    killed = [];
    closed = 0;
    frames = 250;
    dataDir = await createDataDir({
      'mpv_layout.json': { show_mpv: false },
      'shops.json': { shops: [{ platform: 'tiktok', username: 'sample_shop' }] },
    });
  });
  afterEach(async () => {
    await app.close();
    await removeDataDir(dataDir);
  });

  const row = async (): Promise<Record<string, unknown>> =>
    (await callApi(app, 'GET', `/shops/${SHOP}`)).json();

  const until = (
    done: (shop: Record<string, unknown>) => boolean,
  ): Promise<Record<string, unknown>> => pollUntil(row, done, WAIT_LIMIT_MS);

  const startApp = async (
    mpvPlayer: unknown = { get: async () => PLAYER, forget: () => 0 },
  ): Promise<void> => {
    app = await createTestApp({
      dataDir,
      ytdlpRunner: { run: () => Promise.resolve(STREAM_RUN) },
      mpvPlayer: mpvPlayer as never,
      frameGrabber: { grab: hang },
      childProcesses: {
        ...fakeChildProcessRegistry,
        launch: (file: string, args: string[]) => {
          launched.push({ file, args });
          return new FakeMpv();
        },
        kill: async (pid: number) => {
          killed.push(pid);
        },
      },
      mpvIpc: () => ({
        connect: async () => undefined,
        framesShown: async () => frames,
        screenshotToFile: async (temp: string) => {
          await mkdir(dirname(temp), { recursive: true });
          await writeFile(temp, JPEG);
          return true;
        },
        close: () => {
          closed += 1;
        },
      }),
    });
  };

  it('is the default detector: a hidden mpv (show_mpv off) shows frames, the channel is live, and stop kills it', async () => {
    await startApp();

    await callApi(app, 'POST', `/shops/${SHOP}/detection/start`);
    await until((shop) => shop.status === 'live');
    const frame = await callApi(app, 'GET', `/shops/${SHOP}/frame`);
    await callApi(app, 'POST', `/shops/${SHOP}/detection/stop`);

    expect(await row()).toMatchObject({ status: 'not_checked', job_state: 'stopped' });
    expect(launched).toHaveLength(1);
    expect(launched[0].file).toBe(PLAYER.path);
    expect(launched[0].args).toEqual(
      expect.arrayContaining(['--vo=null', '--ao=null', '--keep-open=no']),
    );
    expect(frame.statusCode).toBe(200);
    expect(frame.rawPayload.equals(JPEG)).toBe(true);
    expect(killed).toEqual([PID]);
    expect(closed).toBe(1);
  });

  it('puts the job in error with tool_missing when no mpv is installed', async () => {
    await startApp({ get: async () => null, forget: () => 0 });

    await callApi(app, 'POST', `/shops/${SHOP}/detection/start`);
    await until((shop) => shop.job_state === 'error');

    expect(await row()).toMatchObject({ job_state: 'error', reason_code: 'tool_missing' });
    expect(launched).toHaveLength(0);
  });

  it('a detector change restarts the running job with the new detector', async () => {
    await startApp();
    await callApi(app, 'POST', `/shops/${SHOP}/detection/start`);
    await until((shop) => shop.status === 'live');

    const saved = await callApi(app, 'PUT', '/settings/layout', { detector: 'ffmpeg' });
    await until((shop) => shop.job_state === 'checking_image');

    expect(saved.statusCode).toBe(200);
    expect(killed).toEqual([PID]);
    expect(launched).toHaveLength(1);
    expect(await row()).toMatchObject({ job_state: 'checking_image', attempts: 1 });
  });
});
