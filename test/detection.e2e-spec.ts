import { NestFastifyApplication } from '@nestjs/platform-fastify';

import { GrabOutcome } from '../src/modules/detection/detectors/ffmpeg-frame-grabber';
import { createTestApp } from './helpers/create-test-app';
import { createDataDir, removeDataDir } from './helpers/data-dir';
import { Grab, hang, JPEG, writeFrame } from './helpers/frame-grabs';
import { callApi, expectError } from './helpers/http';

const SHOP = 'tiktok_sample_shop';
const STREAM_RUN = {
  exitCode: 0,
  stdout: 'https://cdn.example/live.flv\n',
  stderr: '',
  timedOut: false,
};
const WAIT_STEP_MS = 20;
const WAIT_LIMIT_MS = 5_000;

async function until<T>(read: () => Promise<T>, done: (value: T) => boolean): Promise<T> {
  const giveUpAt = Date.now() + WAIT_LIMIT_MS;
  for (let value = await read(); ; value = await read()) {
    if (done(value) || Date.now() > giveUpAt) return value;
    await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MS));
  }
}

describe('Live QC detection (e2e)', () => {
  let app: NestFastifyApplication;
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await createDataDir({
      'mpv_layout.json': { detector: 'ffmpeg' },
      'shops.json': { shops: [{ platform: 'tiktok', username: 'sample_shop' }] },
    });
  });
  afterEach(async () => {
    await app.close();
    await removeDataDir(dataDir);
  });

  const row = async (): Promise<Record<string, unknown>> =>
    (await callApi(app, 'GET', `/shops/${SHOP}`)).json();

  async function startApp(grab: Grab): Promise<void> {
    app = await createTestApp({
      dataDir,
      ytdlpRunner: { run: () => Promise.resolve(STREAM_RUN) },
      frameGrabber: { grab },
    });
  }

  it('finds the channel live, serves its frame, and forgets both once stopped', async () => {
    await startApp(writeFrame);

    const start = await callApi(app, 'POST', `/shops/${SHOP}/detection/start`);
    const live = await until(row, (shop) => shop.status === 'live');
    const frame = await app.inject({ method: 'GET', url: `/api/v1/shops/${SHOP}/frame` });
    const stop = await callApi(app, 'POST', `/shops/${SHOP}/detection/stop`);

    expect(start.json()).toEqual({
      key: SHOP,
      state: 'retrying',
      message: null,
      reason_code: null,
    });
    expect(live).toMatchObject({
      status: 'live',
      job_state: 'playing',
      attempts: 1,
      reason_code: null,
      message: null,
      live_since: expect.any(String),
      checked_at: expect.any(String),
      frame_url: expect.stringMatching(new RegExp(`^/api/v1/shops/${SHOP}/frame\\?t=\\d+$`)),
    });
    expect(frame.statusCode).toBe(200);
    expect(frame.headers['content-type']).toBe('image/jpeg');
    expect(frame.rawPayload.equals(JPEG)).toBe(true);
    expect(stop.json()).toEqual({ key: SHOP, state: 'stopped', message: null, reason_code: null });
    expect(await row()).toMatchObject({
      status: 'not_checked',
      job_state: 'stopped',
      frame_url: null,
    });
    expectError(await callApi(app, 'GET', `/shops/${SHOP}/frame`), 404, 'FRAME_NOT_FOUND');
  });

  it('answers a second start with the state of the running job', async () => {
    await startApp(hang);

    await callApi(app, 'POST', `/shops/${SHOP}/detection/start`);
    await until(row, (shop) => shop.job_state === 'checking_image');
    const again = await callApi(app, 'POST', `/shops/${SHOP}/detection/start`);

    expect(again.json()).toMatchObject({ key: SHOP, state: 'checking_image' });
  });

  it('puts a job in error with tool_missing when FFmpeg is not installed, and starting again retries', async () => {
    await startApp(() => Promise.resolve(GrabOutcome.TOOL_MISSING));

    await callApi(app, 'POST', `/shops/${SHOP}/detection/start`);
    const errored = await until(row, (shop) => shop.job_state === 'error');

    expect(errored).toMatchObject({
      job_state: 'error',
      status: 'not_checked',
      reason_code: 'tool_missing',
      message: null,
      frame_url: null,
    });
    const again = await callApi(app, 'POST', `/shops/${SHOP}/detection/start`);
    expect(again.json()).toMatchObject({ state: 'retrying' });
  });

  it('is no_signal / no_frames when the stream opens but shows nothing', async () => {
    await startApp(() => Promise.resolve(GrabOutcome.NO_FRAME));

    await callApi(app, 'POST', `/shops/${SHOP}/detection/start`);
    const shop = await until(row, (value) => value.status === 'no_signal');

    expect(shop).toMatchObject({ status: 'no_signal', reason_code: 'no_frames' });
  });

  it('ends the job of a channel that is deleted, before the delete answers', async () => {
    await startApp(hang);
    await callApi(app, 'POST', `/shops/${SHOP}/detection/start`);
    await until(row, (shop) => shop.job_state === 'checking_image');

    const removed = await callApi(app, 'DELETE', `/shops/${SHOP}`);

    expect(removed.statusCode).toBe(204);
    expectError(await callApi(app, 'GET', `/shops/${SHOP}`), 404, 'SHOP_NOT_FOUND');
    const stop = await callApi(app, 'POST', `/shops/${SHOP}/detection/stop`);
    expect(stop.json()).toMatchObject({ state: 'stopped' });
  });

  it('puts a live channel on the wall with the URL its job resolved, and refresh updates it', async () => {
    const urls = ['https://cdn.example/live.flv\n', 'https://cdn.example/fresh.flv\n'];
    let resolves = 0;
    app = await createTestApp({
      dataDir,
      ytdlpRunner: {
        run: () => Promise.resolve({ ...STREAM_RUN, stdout: urls[Math.min(resolves++, 1)] }),
      },
      frameGrabber: { grab: writeFrame },
    });
    await callApi(app, 'POST', `/shops/${SHOP}/detection/start`);
    await until(row, (shop) => shop.status === 'live');

    const wall = (await callApi(app, 'GET', '/wall')).json();
    const refreshed = await callApi(app, 'POST', `/wall/${SHOP}/refresh`);
    const after = (await callApi(app, 'GET', '/wall')).json();
    await callApi(app, 'POST', `/shops/${SHOP}/detection/stop`);

    expect(resolves).toBe(2);
    expect(wall.tiles).toEqual([
      {
        key: SHOP,
        label: expect.any(String),
        live: true,
        visible: true,
        url: 'https://cdn.example/live.flv',
      },
    ]);
    expect(refreshed.json()).toEqual({ url: 'https://cdn.example/fresh.flv' });
    expect(after.tiles[0].url).toBe('https://cdn.example/fresh.flv');
    expect((await callApi(app, 'GET', '/wall')).json().tiles).toEqual([]);
  });
});
