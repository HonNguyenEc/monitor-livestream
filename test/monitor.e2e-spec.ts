import { NestFastifyApplication } from '@nestjs/platform-fastify';

import { createTestApp } from './helpers/create-test-app';
import { createDataDir, removeDataDir } from './helpers/data-dir';
import { hang } from './helpers/frame-grabs';
import { callApi } from './helpers/http';

const STREAM_RUN = {
  exitCode: 0,
  stdout: 'https://cdn.example/live.flv\n',
  stderr: '',
  timedOut: false,
};
const WAIT_STEP_MS = 20;
const WAIT_LIMIT_MS = 8_000;

describe('Monitor Livestream monitor (e2e)', () => {
  let app: NestFastifyApplication;
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await createDataDir({
      'mpv_layout.json': { detector: 'ffmpeg' },
      'shops.json': {
        shops: [
          { platform: 'tiktok', username: 'one' },
          { platform: 'tiktok', username: 'two' },
        ],
      },
    });
    app = await createTestApp({
      dataDir,
      ytdlpRunner: { run: () => Promise.resolve(STREAM_RUN) },
      frameGrabber: { grab: hang },
    });
  });
  afterEach(async () => {
    await app.close();
    await removeDataDir(dataDir);
  });

  async function jobStates(): Promise<Record<string, string>> {
    const { items } = (await callApi(app, 'GET', '/shops')).json();
    return Object.fromEntries(items.map((row: Record<string, string>) => [row.key, row.job_state]));
  }

  async function until(done: (states: Record<string, string>) => boolean): Promise<void> {
    const giveUpAt = Date.now() + WAIT_LIMIT_MS;
    while (!done(await jobStates()) && Date.now() < giveUpAt) {
      await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MS));
    }
  }

  const running = (state: string | undefined): boolean =>
    state !== undefined && state !== 'stopped';

  it('starts a job for every shop of the platform, and stops them all with the monitor', async () => {
    const started = await callApi(app, 'POST', '/monitor/start', { platforms: ['tiktok'] });
    await until((states) => running(states.tiktok_one) && running(states.tiktok_two));
    const midway = await jobStates();
    const stopped = await callApi(app, 'POST', '/monitor/stop');

    expect(started.json()).toEqual({ running: true, platforms: ['tiktok'], keys: null });
    expect(running(midway.tiktok_one) && running(midway.tiktok_two)).toBe(true);
    expect(stopped.json()).toEqual({ running: false, platforms: [], keys: null });
    expect(await jobStates()).toEqual({ tiktok_one: 'stopped', tiktok_two: 'stopped' });
  });

  it('monitors only the listed keys', async () => {
    await callApi(app, 'POST', '/monitor/start', { platforms: ['tiktok'], keys: ['tiktok_two'] });
    await until((states) => running(states.tiktok_two));

    expect(await jobStates()).toEqual({ tiktok_one: 'stopped', tiktok_two: expect.any(String) });
    expect((await callApi(app, 'GET', '/monitor')).json()).toEqual({
      running: true,
      platforms: ['tiktok'],
      keys: ['tiktok_two'],
    });
  });

  it('a rename moves the selection, so the channel is monitored under its new key', async () => {
    await callApi(app, 'POST', '/monitor/start', { platforms: ['tiktok'], keys: ['tiktok_one'] });
    await until((states) => running(states.tiktok_one));

    const renamed = await callApi(app, 'PUT', '/shops/tiktok_one', { username: 'uno' });
    await until((states) => running(states.tiktok_uno));

    expect(renamed.json()).toMatchObject({ key: 'tiktok_uno' });
    expect((await callApi(app, 'GET', '/monitor')).json().keys).toEqual(['tiktok_uno']);
    expect(await jobStates()).toEqual({
      tiktok_uno: expect.stringMatching(/^(retrying|checking_image)$/),
      tiktok_two: 'stopped',
    });
  });
});
